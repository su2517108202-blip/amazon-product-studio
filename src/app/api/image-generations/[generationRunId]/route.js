import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { imageGenerationRunToResponse, normalizedGenerationError } from "@/lib/image-generation";

export async function GET(_req, context) {
  try {
    const { generationRunId } = await context.params;
    const user = await requireCurrentUser();
    const run = await prisma.imageGenerationRun.findFirst({
      where: { id: generationRunId, project: { userId: user.id } },
      include: { generatedImages: { orderBy: { createdAt: "desc" } } },
    });

    if (!run) {
      return NextResponse.json({ code: "RUN_NOT_FOUND", error: "Generation run not found" }, { status: 404 });
    }

    return NextResponse.json(imageGenerationRunToResponse(run));
  } catch (error) {
    const normalized = normalizedGenerationError(error);
    return NextResponse.json(
      { code: normalized.code, error: normalized.message },
      { status: error.httpStatus || 500 },
    );
  }
}
