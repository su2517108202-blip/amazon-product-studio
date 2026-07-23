import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { generatedCandidateToResponse } from "@/lib/result-management";

export async function PATCH(req, context) {
  try {
    const { projectId, planId } = await context.params;
    const user = await requireCurrentUser();
    const body = await req.json().catch(() => ({}));
    const generatedImageId =
      body.generatedImageId === null ? null : String(body.generatedImageId || "").trim();

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, userId: user.id },
        select: { id: true },
      });
      if (!project) {
        return { status: 404, body: { code: "PROJECT_NOT_FOUND", error: "Project not found" } };
      }

      const imagePlan = await tx.imagePlan.findFirst({
        where: { id: planId, projectId },
        select: { id: true, preferredGeneratedImageId: true },
      });
      if (!imagePlan) {
        return { status: 404, body: { code: "IMAGE_PLAN_NOT_FOUND", error: "Image plan not found" } };
      }

      if (generatedImageId === null) {
        const updated = await tx.imagePlan.update({
          where: { id: planId },
          data: { preferredGeneratedImageId: null },
          select: { id: true, preferredGeneratedImageId: true },
        });
        return { status: 200, body: { ok: true, ...updated, preferredImage: null } };
      }

      if (!generatedImageId) {
        return {
          status: 404,
          body: { code: "GENERATED_IMAGE_NOT_FOUND", error: "Generated image not found" },
        };
      }

      const generatedImage = await tx.generatedImage.findFirst({
        where: { id: generatedImageId, projectId, deletedAt: null },
        include: {
          generationRun: {
            select: {
              id: true,
              provider: true,
              model: true,
              protocol: true,
              status: true,
              mode: true,
              aspectRatio: true,
              resolution: true,
              usedStaleInput: true,
              isForcedVersion: true,
              durationMs: true,
              createdAt: true,
              completedAt: true,
              errorCode: true,
            },
          },
        },
      });
      if (!generatedImage) {
        return {
          status: 404,
          body: { code: "GENERATED_IMAGE_NOT_FOUND", error: "Generated image not found" },
        };
      }
      if (generatedImage.imagePlanId !== planId) {
        return { status: 409, body: { code: "IMAGE_NOT_IN_PLAN", error: "Image is not in this plan" } };
      }

      const updated = await tx.imagePlan.update({
        where: { id: planId },
        data: { preferredGeneratedImageId: generatedImage.id },
        select: { id: true, preferredGeneratedImageId: true },
      });
      const candidateNumber = await tx.generatedImage.count({
        where: {
          projectId,
          imagePlanId: planId,
          deletedAt: null,
          OR: [
            { createdAt: { lt: generatedImage.createdAt } },
            { createdAt: generatedImage.createdAt, id: { lte: generatedImage.id } },
          ],
        },
      });

      return {
        status: 200,
        body: {
          ok: true,
          ...updated,
          preferredImage: generatedCandidateToResponse(generatedImage, {
            candidateNumber,
            preferredGeneratedImageId: generatedImage.id,
          }),
        },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { code: "PREFERRED_IMAGE_UPDATE_FAILED", error: "Unable to update preferred image" },
      { status: 500 },
    );
  }
}
