import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/errors";
import {
  buildPromptSnapshot,
  calculateGenerationFingerprint,
  generatedImageToResponse,
  getAsyncGenerationExpiresAt,
  imageGenerationRunToResponse,
  loadGenerationReferences,
  normalizedGenerationError,
  persistGeneratedImages,
  pickDefaultGenerationReferences,
  supportsImageGenerationProfile,
  validateImageGenerationProtocol,
} from "@/lib/image-generation";

async function loadGenerationContext(projectId, planId, userId) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      productIdentity: true,
      referenceImages: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      imagePlans: {
        where: { id: planId },
        take: 1,
      },
    },
  });

  if (!project) throw new ProviderError("PROJECT_NOT_FOUND", "Project not found");
  const imagePlan = project.imagePlans[0];
  if (!imagePlan) throw new ProviderError("MISSING_IMAGE_PLAN", "Image plan not found");
  return { project, imagePlan };
}

export async function GET(_req, context) {
  try {
    const { projectId, planId } = await context.params;
    const user = await requireCurrentUser();
    await loadGenerationContext(projectId, planId, user.id);

    const [latestRun, latestImage, successCount, failureCount] = await Promise.all([
      prisma.imageGenerationRun.findFirst({
        where: { projectId, imagePlanId: planId },
        orderBy: { createdAt: "desc" },
        include: { generatedImages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } } },
      }),
      prisma.generatedImage.findFirst({
        where: { projectId, imagePlanId: planId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
      prisma.imageGenerationRun.count({
        where: { projectId, imagePlanId: planId, status: "completed" },
      }),
      prisma.imageGenerationRun.count({
        where: { projectId, imagePlanId: planId, status: "failed" },
      }),
    ]);

    return NextResponse.json({
      latestRun: imageGenerationRunToResponse(latestRun),
      latestImage: generatedImageToResponse(latestImage),
      stats: { successCount, failureCount },
    });
  } catch (error) {
    const normalized = normalizedGenerationError(error);
    return NextResponse.json(
      { code: normalized.code, error: normalized.message },
      { status: error.httpStatus || 500 },
    );
  }
}

export async function POST(req, context) {
  let run = null;
  const startedAt = Date.now();

  try {
    const { projectId, planId } = await context.params;
    const user = await requireCurrentUser();
    const body = await req.json().catch(() => ({}));
    const { project, imagePlan } = await loadGenerationContext(projectId, planId, user.id);

    if (!project.productIdentity) {
      throw new ProviderError("MISSING_PRODUCT_IDENTITY", "Product identity is required before image generation");
    }
    const allowStale = body.allowStaleInput === true;
    if ((project.productIdentity.isStale || imagePlan.isStale) && !allowStale) {
      throw new ProviderError(
        project.productIdentity.isStale ? "STALE_PRODUCT_IDENTITY" : "STALE_IMAGE_PLAN",
        "Current identity or plan is stale",
        { httpStatus: 409 },
      );
    }
    if (!imagePlan.finalPrompt?.trim()) {
      throw new ProviderError("INVALID_PROMPT", "Image plan final prompt is empty");
    }

    const assignment = await prisma.modelRoleAssignment.findUnique({
      where: { userId_role: { userId: user.id, role: "image_generation" } },
      include: { providerProfile: true },
    });
    const profile = assignment?.providerProfile;
    if (!profile) {
      throw new ProviderError("MISSING_IMAGE_GENERATION_PROVIDER", "Image generation provider is not configured");
    }
    if (!supportsImageGenerationProfile(profile)) {
      throw new ProviderError("CAPABILITY_MISMATCH", "Provider is not image generation capable");
    }
    validateImageGenerationProtocol(profile);

    const selectedReferences = selectReferenceImages(project.referenceImages, body.referenceImageIds);
    const loadedReferences = await loadGenerationReferences(selectedReferences);
    const output = {
      aspectRatio: body.aspectRatio || project.aspectRatio || "1:1",
      resolution: ["1K", "2K"].includes(body.resolution) ? body.resolution : "1K",
      count: 1,
      format: "png",
    };
    const prompt = buildPromptSnapshot({
      project,
      productIdentity: project.productIdentity,
      imagePlan,
      referenceImages: selectedReferences,
      output,
    });
    const inputFingerprint = calculateGenerationFingerprint({
      project,
      productIdentity: project.productIdentity,
      imagePlan,
      referenceImages: selectedReferences,
      providerProfile: profile,
      output,
    });

    if (!body.force) {
      const reusable = await prisma.imageGenerationRun.findFirst({
        where: {
          projectId,
          imagePlanId: planId,
          inputFingerprint,
          status: "completed",
          generatedImages: { some: { deletedAt: null } },
        },
        orderBy: { completedAt: "desc" },
        include: { generatedImages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } } },
      });
      if (reusable) {
        return NextResponse.json({
          ok: true,
          reused: true,
          run: imageGenerationRunToResponse(reusable),
          image: generatedImageToResponse(reusable.generatedImages[0]),
        });
      }
    }

    run = await prisma.imageGenerationRun.create({
      data: {
        projectId,
        imagePlanId: planId,
        providerProfileId: profile.id,
        provider: profile.provider,
        model: profile.modelId,
        protocol: profile.protocol,
        status: "processing",
        mode: "sync",
        inputFingerprint,
        promptSnapshot: prompt,
        aspectRatio: output.aspectRatio,
        resolution: output.resolution,
        requestedCount: 1,
        usedStaleInput: project.productIdentity.isStale || imagePlan.isStale,
        isForcedVersion: body.force === true,
      },
    });

    const adapter = getProviderAdapter(profile.provider);
    const result = await adapter.generateImage(buildProviderConfig(profile), {
      project,
      productIdentity: project.productIdentity,
      imagePlan,
      referenceImages: loadedReferences,
      prompt,
      output,
    });

    if (result.status === "processing" && result.mode === "async") {
      const updated = await prisma.imageGenerationRun.update({
        where: { id: run.id },
        data: {
          status: "processing",
          mode: "async",
          externalTaskId: result.externalTaskId,
          expiresAt: getAsyncGenerationExpiresAt(),
          durationMs: Date.now() - startedAt,
        },
        include: { generatedImages: true },
      });
      return NextResponse.json({ ok: true, reused: false, run: imageGenerationRunToResponse(updated) });
    }

    const images = await persistGeneratedImages({
      projectId,
      imagePlanId: planId,
      generationRunId: run.id,
      images: result.images || [],
    });
    const completed = await prisma.imageGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        mode: result.mode || "sync",
        externalTaskId: result.externalTaskId || null,
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
      include: { generatedImages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json({
      ok: true,
      reused: false,
      run: imageGenerationRunToResponse(completed),
      image: generatedImageToResponse(images[0]),
    });
  } catch (error) {
    const normalized = normalizedGenerationError(error);
    if (run) {
      await prisma.imageGenerationRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorCode: normalized.code,
          errorMessage: normalized.message.slice(0, 800),
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });
    }
    return NextResponse.json(
      { ok: false, code: normalized.code, error: normalized.message },
      { status: error.httpStatus || normalized.httpStatus || 400 },
    );
  }
}

function selectReferenceImages(referenceImages, requestedIds = []) {
  const primary = referenceImages.find((image) => image.isPrimary);
  if (!primary) return [];
  if (Array.isArray(requestedIds) && requestedIds.length) {
    const ids = new Set([primary.id, ...requestedIds]);
    return referenceImages.filter((image) => ids.has(image.id));
  }
  return pickDefaultGenerationReferences(referenceImages);
}
