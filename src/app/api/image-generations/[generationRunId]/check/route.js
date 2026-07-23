import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import {
  MAX_ASYNC_CHECK_ATTEMPTS,
  TERMINAL_ASYNC_ERROR_CODES,
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
    if (run.expiresAt && run.expiresAt.getTime() <= Date.now()) {
      const expired = await markRunFailed(run.id, {
        code: "ASYNC_TASK_EXPIRED",
        message: "Async image generation expired",
        durationMs: Date.now() - startedAt,
        touch: true,
      });
      return NextResponse.json(imageGenerationRunToResponse(expired));
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

    const checked = await prisma.imageGenerationRun.update({
      where: { id: run.id },
      data: {
        checkAttempts: { increment: 1 },
        lastCheckedAt: new Date(),
      },
      include: { generatedImages: true },
    });
    if (checked.checkAttempts >= MAX_ASYNC_CHECK_ATTEMPTS) {
      const failed = await markRunFailed(run.id, {
        code: "ASYNC_TASK_FAILED",
        message: "Async image generation exceeded max check attempts",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(imageGenerationRunToResponse(failed));
    }

    const adapter = getProviderAdapter(profile.provider);
    const result = await adapter.checkGeneration(buildProviderConfig(profile), {
      externalTaskId: run.externalTaskId,
      runId: run.id,
    });

    if (result.status === "processing") {
      const updated = await prisma.imageGenerationRun.update({
        where: { id: run.id },
        data: {
          durationMs: Date.now() - startedAt,
          errorCode: null,
          errorMessage: null,
        },
        include: { generatedImages: true },
      });
      return NextResponse.json(imageGenerationRunToResponse(updated));
    }

    if (result.status === "failed") {
      const failed = await markRunFailed(run.id, {
        code: result.error?.code || "ASYNC_TASK_FAILED",
        message: result.error?.message || "Async image generation failed",
        durationMs: Date.now() - startedAt,
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
    const { generationRunId } = await context.params;
    const run = await prisma.imageGenerationRun.findUnique({
      where: { id: generationRunId },
      include: { generatedImages: true },
    }).catch(() => null);
    if (run?.status === "processing" && run.mode === "async") {
      if (TERMINAL_ASYNC_ERROR_CODES.has(normalized.code)) {
        const failed = await markRunFailed(run.id, {
          code: normalized.code,
          message: normalized.message,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(imageGenerationRunToResponse(failed));
      }
      const updated = await prisma.imageGenerationRun.update({
        where: { id: run.id },
        data: {
          errorCode: normalized.code,
          errorMessage: normalized.message.slice(0, 800),
          durationMs: Date.now() - startedAt,
        },
        include: { generatedImages: true },
      });
      return NextResponse.json(imageGenerationRunToResponse(updated));
    }
    return NextResponse.json(
      { code: normalized.code, error: normalized.message },
      { status: error.httpStatus || normalized.httpStatus || 400 },
    );
  }
}

async function markRunFailed(runId, { code, message, durationMs, touch = false }) {
  return prisma.imageGenerationRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      ...(touch
        ? {
            checkAttempts: { increment: 1 },
            lastCheckedAt: new Date(),
          }
        : {}),
      errorCode: code,
      errorMessage: String(message || "Async image generation failed").slice(0, 800),
      durationMs,
      completedAt: new Date(),
    },
    include: { generatedImages: true },
  });
}
