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
  let ownedRunId = "";
  let ownerUserId = "";

  try {
    const { generationRunId } = await context.params;
    const user = await requireCurrentUser();
    ownerUserId = user.id;
    const run = await loadOwnedRun(generationRunId, user.id);

    if (!run) {
      return NextResponse.json({ code: "RUN_NOT_FOUND", error: "Generation run not found" }, { status: 404 });
    }
    ownedRunId = run.id;

    if (run.status !== "processing" || run.mode !== "async") {
      return NextResponse.json(imageGenerationRunToResponse(run));
    }
    if (run.expiresAt && run.expiresAt.getTime() <= Date.now()) {
      const expired = await markOwnedRunFailed(run.id, user.id, {
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

    const checked = await updateOwnedRun(run.id, user.id, {
      data: {
        checkAttempts: { increment: 1 },
        lastCheckedAt: new Date(),
      },
    });
    if (!checked) {
      return NextResponse.json({ code: "RUN_NOT_FOUND", error: "Generation run not found" }, { status: 404 });
    }

    if (checked.checkAttempts >= MAX_ASYNC_CHECK_ATTEMPTS) {
      const failed = await markOwnedRunFailed(run.id, user.id, {
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
      const updated = await updateOwnedRun(run.id, user.id, {
        data: {
          durationMs: Date.now() - startedAt,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (!updated) {
        return NextResponse.json({ code: "RUN_NOT_FOUND", error: "Generation run not found" }, { status: 404 });
      }
      return NextResponse.json(imageGenerationRunToResponse(updated));
    }

    if (result.status === "failed") {
      const failed = await markOwnedRunFailed(run.id, user.id, {
        code: result.error?.code || "ASYNC_TASK_FAILED",
        message: result.error?.message || "Async image generation failed",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(imageGenerationRunToResponse(failed));
    }

    const ownedForPersist = await loadOwnedRun(run.id, user.id);
    if (!ownedForPersist) {
      return NextResponse.json({ code: "RUN_NOT_FOUND", error: "Generation run not found" }, { status: 404 });
    }

    await persistGeneratedImages({
      projectId: ownedForPersist.projectId,
      imagePlanId: ownedForPersist.imagePlanId,
      generationRunId: ownedForPersist.id,
      images: result.images || [],
    });
    const completed = await updateOwnedRun(run.id, user.id, {
      data: {
        status: "completed",
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
      include: { generatedImages: { orderBy: { createdAt: "desc" } } },
    });
    if (!completed) {
      return NextResponse.json({ code: "RUN_NOT_FOUND", error: "Generation run not found" }, { status: 404 });
    }

    return NextResponse.json(imageGenerationRunToResponse(completed));
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "Unauthorized" }, { status: 401 });
    }

    const normalized = normalizedGenerationError(error);
    const run = ownedRunId && ownerUserId
      ? await loadOwnedRun(ownedRunId, ownerUserId).catch(() => null)
      : null;

    if (run?.status === "processing" && run.mode === "async") {
      if (TERMINAL_ASYNC_ERROR_CODES.has(normalized.code)) {
        const failed = await markOwnedRunFailed(run.id, ownerUserId, {
          code: normalized.code,
          message: normalized.message,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(imageGenerationRunToResponse(failed));
      }
      const updated = await updateOwnedRun(run.id, ownerUserId, {
        data: {
          errorCode: normalized.code,
          errorMessage: normalized.message.slice(0, 800),
          durationMs: Date.now() - startedAt,
        },
      });
      if (updated) {
        return NextResponse.json(imageGenerationRunToResponse(updated));
      }
    }

    return NextResponse.json(
      { code: normalized.code, error: normalized.message },
      { status: error.httpStatus || normalized.httpStatus || 400 },
    );
  }
}

async function loadOwnedRun(runId, userId, include = { generatedImages: true }) {
  if (!runId || !userId) return null;
  return prisma.imageGenerationRun.findFirst({
    where: { id: runId, project: { userId } },
    include,
  });
}

async function updateOwnedRun(runId, userId, { data, include = { generatedImages: true } }) {
  if (!runId || !userId) return null;
  const result = await prisma.imageGenerationRun.updateMany({
    where: { id: runId, project: { userId } },
    data,
  });
  if (result.count !== 1) return null;
  return loadOwnedRun(runId, userId, include);
}

async function markOwnedRunFailed(runId, userId, { code, message, durationMs, touch = false }) {
  return updateOwnedRun(runId, userId, {
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
