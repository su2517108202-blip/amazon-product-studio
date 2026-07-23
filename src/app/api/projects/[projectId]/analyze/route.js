import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { parseCapabilities } from "@/lib/provider-profiles";
import {
  identityToDbData,
  identityToResponse,
} from "@/lib/product-identity";
import {
  buildAnalysisImages,
  calculateInputFingerprint,
  pickAnalysisImages,
  runToResponse,
} from "@/lib/product-analysis";
import { sanitizeReferenceImage } from "@/lib/projects";

async function getProject(projectId, userId) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      productIdentity: true,
      referenceImages: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      code: error.code || "UPSTREAM_ERROR",
      message: error.message || "商品识别失败",
      httpStatus: error.httpStatus || 0,
    },
    { status },
  );
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
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const selectedImages = pickAnalysisImages(project);
    const inputFingerprint = await calculateInputFingerprint(project, selectedImages);

    if (
      project.productIdentity &&
      project.productIdentity.inputFingerprint === inputFingerprint &&
      !project.productIdentity.isStale &&
      !body.force
    ) {
      return NextResponse.json({
        ok: true,
        reused: true,
        message: "当前参考图未变化，可复用上次识别结果",
        identity: identityToResponse(project.productIdentity),
        selectedImages: selectedImages.map(sanitizeReferenceImage),
      });
    }

    const assignment = await prisma.modelRoleAssignment.findUnique({
      where: { userId_role: { userId: user.id, role: "product_vision" } },
      include: { providerProfile: true },
    });

    if (!assignment?.providerProfile) {
      const error = new Error("请先在 API 设置中绑定商品识图模型");
      error.code = "MISSING_PROVIDER_PROFILE";
      return errorResponse(error, 400);
    }

    profile = assignment.providerProfile;
    const capabilities = parseCapabilities(profile);
    if (!profile.enabled || !capabilities.includes("vision")) {
      const error = new Error("当前商品识图配置不可用或缺少 vision 能力");
      error.code = "CAPABILITY_MISMATCH";
      return errorResponse(error, 400);
    }

    run = await prisma.productAnalysisRun.create({
      data: {
        projectId,
        providerProfileId: profile.id,
        provider: profile.provider,
        model: profile.modelId,
        inputFingerprint,
        status: "processing",
      },
    });

    const images = await buildAnalysisImages(project);
    const adapter = getProviderAdapter(profile.provider);
    const result = await adapter.analyzeProduct(buildProviderConfig(profile), {
      project,
      images,
    });

    const saved = await prisma.productIdentity.upsert({
      where: { projectId },
      create: {
        projectId,
        ...identityToDbData(result),
        sourceProvider: profile.provider,
        sourceModel: profile.modelId,
        sourceProfileId: profile.id,
        inputFingerprint,
        isStale: false,
      },
      update: {
        ...identityToDbData(result),
        sourceProvider: profile.provider,
        sourceModel: profile.modelId,
        sourceProfileId: profile.id,
        inputFingerprint,
        isStale: false,
      },
    });

    const updatedRun = await prisma.productAnalysisRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
    });

    await prisma.imagePlan.updateMany({
      where: { projectId },
      data: { isStale: true },
    });

    return NextResponse.json({
      ok: true,
      reused: false,
      identity: identityToResponse(saved),
      run: runToResponse(updatedRun),
      selectedImages: selectedImages.map(sanitizeReferenceImage),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error("[PRODUCT_ANALYSIS_ERROR]", {
      projectId,
      profileId: profile?.id || "",
      provider: profile?.provider || "",
      model: profile?.modelId || "",
      errorCode: error.code || "UPSTREAM_ERROR",
      httpStatus: error.httpStatus || 0,
      durationMs,
    });

    if (run) {
      await prisma.productAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorCode: error.code || "UPSTREAM_ERROR",
          errorMessage: error.message || "商品识别失败",
          durationMs,
          completedAt: new Date(),
        },
      });
    }

    return errorResponse(error, 400);
  }
}
