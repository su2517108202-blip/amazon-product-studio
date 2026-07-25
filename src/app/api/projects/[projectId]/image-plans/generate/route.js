import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { parseCapabilities } from "@/lib/provider-profiles";
import {
  buildImagePlanningInput,
  calculatePlanningFingerprint,
  imagePlanToDbData,
  imagePlanToResponse,
  planningRunToResponse,
} from "@/lib/image-planning";

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      code: error.code || "UPSTREAM_ERROR",
      message: error.message || "Image planning failed",
      httpStatus: error.httpStatus || 0,
    },
    { status },
  );
}

async function getProject(projectId, userId) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      productIdentity: true,
      referenceImages: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      imagePlans: {
        orderBy: { planIndex: "asc" },
      },
    },
  });
}

export async function POST(req, context) {
  const startedAt = Date.now();
  let run = null;
  let profile = null;
  let projectId = "";

  try {
    const params = await context.params;
    projectId = params.projectId;
    const user = await requireCurrentUser();
    const body = await req.json().catch(() => ({}));
    const project = await getProject(projectId, user.id);

    if (!project) {
      return NextResponse.json({ error: "未找到项目" }, { status: 404 });
    }
    if (!project.productIdentity) {
      const error = new Error("Please create a product identity before planning");
      error.code = "MISSING_PRODUCT_IDENTITY";
      return errorResponse(error, 400);
    }
    if (project.productIdentity.isStale && !body.allowStaleIdentity) {
      const error = new Error("Product identity is stale; confirmation is required");
      error.code = "STALE_PRODUCT_IDENTITY";
      return errorResponse(error, 409);
    }

    const assignment = await prisma.modelRoleAssignment.findUnique({
      where: { userId_role: { userId: user.id, role: "image_planning" } },
      include: { providerProfile: true },
    });

    if (!assignment?.providerProfile) {
      const error = new Error("Please bind an image planning model first");
      error.code = "MISSING_PROVIDER_PROFILE";
      return errorResponse(error, 400);
    }

    profile = assignment.providerProfile;
    const effectiveModelId = (assignment.modelId || profile.modelId || "").trim();
    // P1-5: Use effectiveConfig for all validation
    const effectiveConfig = buildProviderConfig(profile, { modelId: effectiveModelId });
    if (!profile.enabled || !effectiveConfig.capabilities?.includes("text")) {
      const error = new Error("Planning model is disabled or lacks text capability");
      error.code = "CAPABILITY_MISMATCH";
      return errorResponse(error, 400);
    }

    const inputFingerprint = calculatePlanningFingerprint({
      project,
      identity: project.productIdentity,
      providerProfile: { ...profile, modelId: effectiveModelId },
    });
    const reusablePlans = project.imagePlans.filter(
      (plan) => plan.inputFingerprint === inputFingerprint && !plan.isStale,
    );

    if (reusablePlans.length === 5 && !body.force) {
      return NextResponse.json({
        ok: true,
        reused: true,
        plans: reusablePlans.map(imagePlanToResponse),
      });
    }

    run = await prisma.imagePlanningRun.create({
      data: {
        projectId,
        providerProfileId: profile.id,
        provider: profile.provider,
        model: effectiveModelId,
        status: "processing",
        inputFingerprint,
      },
    });

    const adapter = getProviderAdapter(profile.provider);
    const plans = await adapter.createImagePlan(effectiveConfig, {
      ...buildImagePlanningInput(project, project.productIdentity, project.referenceImages),
      taskContract: {
        count: 5,
        taskTypes: ["hero", "structure", "function", "scenario", "detail"],
      },
    });

    const savedPlans = await prisma.$transaction(async (tx) => {
      const saved = [];
      for (const plan of plans) {
        const data = imagePlanToDbData(plan, {
          inputFingerprint,
          sourceProvider: profile.provider,
          sourceModel: effectiveModelId,
          sourceProfileId: profile.id,
        });
        saved.push(
          await tx.imagePlan.upsert({
            where: { projectId_planIndex: { projectId, planIndex: plan.index } },
            create: { projectId, ...data },
            update: data,
          }),
        );
      }
      return saved;
    });

    const updatedRun = await prisma.imagePlanningRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      reused: false,
      plans: savedPlans.map(imagePlanToResponse),
      run: planningRunToResponse(updatedRun),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error("[IMAGE_PLANNING_ERROR]", {
      projectId,
      profileId: profile?.id || "",
      provider: profile?.provider || "",
      model: profile?.modelId || "",
      planningRunId: run?.id || "",
      errorCode: error.code || "UPSTREAM_ERROR",
      httpStatus: error.httpStatus || 0,
      durationMs,
    });

    if (run) {
      await prisma.imagePlanningRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorCode: error.code || "UPSTREAM_ERROR",
          errorMessage: error.message || "Image planning failed",
          durationMs,
          completedAt: new Date(),
        },
      });
    }

    return errorResponse(error, 400);
  }
}
