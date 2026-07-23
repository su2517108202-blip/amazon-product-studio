import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { generatedCandidateToResponse } from "@/lib/result-management";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

export async function GET(req, context) {
  try {
    const { projectId, planId } = await context.params;
    const user = await requireCurrentUser();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), MAX_LIMIT);
    const cursor = url.searchParams.get("cursor") || "";

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ code: "PROJECT_NOT_FOUND", error: "未找到项目" }, { status: 404 });
    }

    const imagePlan = await prisma.imagePlan.findFirst({
      where: { id: planId, projectId },
      select: { id: true, preferredGeneratedImageId: true },
    });
    if (!imagePlan) {
      return NextResponse.json({ code: "IMAGE_PLAN_NOT_FOUND", error: "未找到图片策划" }, { status: 404 });
    }

    const [ordered, items, candidateCount, completedRunCount, failedRunCount, latestProcessingRun] =
      await Promise.all([
        prisma.generatedImage.findMany({
          where: { projectId, imagePlanId: planId, deletedAt: null },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true },
        }),
        prisma.generatedImage.findMany({
          where: { projectId, imagePlanId: planId, deletedAt: null },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
        }),
        prisma.generatedImage.count({ where: { projectId, imagePlanId: planId, deletedAt: null } }),
        prisma.imageGenerationRun.count({ where: { projectId, imagePlanId: planId, status: "completed" } }),
        prisma.imageGenerationRun.count({ where: { projectId, imagePlanId: planId, status: "failed" } }),
        prisma.imageGenerationRun.findFirst({
          where: { projectId, imagePlanId: planId, status: "processing", mode: "async" },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, mode: true, createdAt: true },
        }),
      ]);

    const candidateNumbers = new Map(ordered.map((image, index) => [image.id, index + 1]));
    const nextCursor = items.length === (Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT)
      ? items[items.length - 1]?.id || null
      : null;

    return NextResponse.json({
      items: items.map((image) =>
        generatedCandidateToResponse(image, {
          candidateNumber: candidateNumbers.get(image.id) || 1,
          preferredGeneratedImageId: imagePlan.preferredGeneratedImageId,
        }),
      ),
      nextCursor,
      preferredGeneratedImageId: imagePlan.preferredGeneratedImageId,
      stats: {
        candidateCount,
        completedRunCount,
        failedRunCount,
        latestProcessingRun,
      },
    });
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "未登录或无权访问" }, { status: 401 });
    }
    return NextResponse.json(
      { code: "GENERATED_IMAGE_LIST_FAILED", error: "无法读取候选图" },
      { status: 500 },
    );
  }
}
