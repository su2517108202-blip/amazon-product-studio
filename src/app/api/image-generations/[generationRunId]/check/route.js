import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import {
  imageGenerationRunToResponse,
  normalizedGenerationError,
  persistGeneratedImages,
} from "@/lib/image-generation";

export async function POST(_req, context) {
  const startedAt = Date.now();
  try {
    const { generationRunId } = await context.params;
    const user = await requireCurrentUser();
    const run = await prisma.imageGenerationRun.findFirst({
      where: { id: generationRunId, project: { userId: user.id } },
      include: { generatedImages: true },
    });

    if (!run) {
      return NextResponse.json({ code: "RUN_NOT_FOUND", error: "Generation run not found" }, { status: 404 });
    }
    if (run.status !== "processing" || run.mode !== "async") {
      return NextResponse.json(imageGenerationRunToResponse(run));
    }

    const profile = await prisma.providerProfile.findFirst({
      where: { id: run.providerProfileId || "", userId: user.id },
    });
    if (!profile) {
      return NextResponse.json(
        { code: "MISSING_IMAGE_GENERATION_PROVIDER", error: "Image generation provider is missing" },
        { status: 404 },
      );
    }

    const adapter = getProviderAdapter(profile.provider);
    const result = await adapter.checkGeneration(buildProviderConfig(profile), {
      externalTaskId: run.externalTaskId,
      runId: run.id,
    });

    if (result.status === "processing") {
      const updated = await prisma.imageGenerationRun.update({
        where: { id: run.id },
        data: { durationMs: Date.now() - startedAt },
        include: { generatedImages: true },
      });
      return NextResponse.json(imageGenerationRunToResponse(updated));
    }

    if (result.status === "failed") {
      const failed = await prisma.imageGenerationRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorCode: result.error?.code || "ASYNC_TASK_FAILED",
          errorMessage: String(result.error?.message || "Async image generation failed").slice(0, 800),
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
        include: { generatedImages: true },
      });
      return NextResponse.json(imageGenerationRunToResponse(failed));
    }

    await persistGeneratedImages({
      projectId: run.projectId,
      imagePlanId: run.imagePlanId,
      generationRunId: run.id,
      images: result.images || [],
    });
    const completed = await prisma.imageGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
      include: { generatedImages: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json(imageGenerationRunToResponse(completed));
  } catch (error) {
    const normalized = normalizedGenerationError(error);
    return NextResponse.json(
      { code: normalized.code, error: normalized.message },
      { status: error.httpStatus || normalized.httpStatus || 400 },
    );
  }
}
