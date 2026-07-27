import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { REQUIRED_PLAN_COUNT } from "@/lib/result-management";
import { imageGenerationRunToResponse } from "@/lib/image-generation";

export async function GET(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ code: "PROJECT_NOT_FOUND", error: "未找到项目" }, { status: 404 });
    }

    const [plans, candidateGroups, runGroups, latestRuns, latestProcessingRuns] = await Promise.all([
      prisma.imagePlan.findMany({
        where: { projectId },
        orderBy: { planIndex: "asc" },
        select: {
          id: true,
          planIndex: true,
          taskType: true,
          status: true,
          isStale: true,
          preferredGeneratedImageId: true,
        },
      }),
      prisma.generatedImage.groupBy({
        by: ["imagePlanId"],
        where: { projectId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.imageGenerationRun.groupBy({
        by: ["imagePlanId", "status"],
        where: { projectId },
        _count: { _all: true },
      }),
      prisma.imageGenerationRun.findMany({
        where: { projectId },
        orderBy: [{ imagePlanId: "asc" }, { createdAt: "desc" }],
        distinct: ["imagePlanId"],
        select: {
          id: true,
          projectId: true,
          imagePlanId: true,
          providerProfileId: true,
          provider: true,
          model: true,
          protocol: true,
          status: true,
          mode: true,
          externalTaskId: true,
          inputFingerprint: true,
          aspectRatio: true,
          resolution: true,
          requestedCount: true,
          usedStaleInput: true,
          isForcedVersion: true,
          checkAttempts: true,
          lastCheckedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          errorCode: true,
          errorMessage: true,
          durationMs: true,
        },
      }),
      prisma.imageGenerationRun.findMany({
        where: { projectId, status: "processing", mode: "async" },
        orderBy: [{ imagePlanId: "asc" }, { createdAt: "desc" }],
        distinct: ["imagePlanId"],
        select: {
          id: true,
          projectId: true,
          imagePlanId: true,
          providerProfileId: true,
          provider: true,
          model: true,
          protocol: true,
          status: true,
          mode: true,
          externalTaskId: true,
          inputFingerprint: true,
          aspectRatio: true,
          resolution: true,
          requestedCount: true,
          usedStaleInput: true,
          isForcedVersion: true,
          checkAttempts: true,
          lastCheckedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          errorCode: true,
          errorMessage: true,
          durationMs: true,
        },
      }),
    ]);

    const candidateCountByPlan = new Map(
      candidateGroups.map((group) => [group.imagePlanId, group._count._all]),
    );
    const runCountsByPlan = new Map();
    for (const group of runGroups) {
      const current = runCountsByPlan.get(group.imagePlanId) || {};
      current[group.status] = group._count._all;
      runCountsByPlan.set(group.imagePlanId, current);
    }
    const latestRunByPlan = new Map(latestRuns.map((run) => [run.imagePlanId, run]));
    const processingRunByPlan = new Map(latestProcessingRuns.map((run) => [run.imagePlanId, run]));

    const items = plans.map((plan) => {
      const runCounts = runCountsByPlan.get(plan.id) || {};
      return {
        id: plan.id,
        planIndex: plan.planIndex,
        taskType: plan.taskType,
        status: plan.status,
        isStale: plan.isStale,
        candidateCount: candidateCountByPlan.get(plan.id) || 0,
        preferredGeneratedImageId: plan.preferredGeneratedImageId,
        hasPreferred: Boolean(plan.preferredGeneratedImageId),
        completedRunCount: runCounts.completed || 0,
        failedRunCount: runCounts.failed || 0,
        processingRun: imageGenerationRunToResponse(processingRunByPlan.get(plan.id)),
        latestRun: imageGenerationRunToResponse(latestRunByPlan.get(plan.id)),
      };
    });

    const missingPreferredPlans = items
      .filter((plan) => !plan.hasPreferred)
      .map((plan) => ({
        planId: plan.id,
        planIndex: plan.planIndex,
        taskType: plan.taskType,
        label: `图${plan.planIndex} ${plan.taskType}`,
      }));
    const generatedPlanCount = items.filter((plan) => plan.candidateCount > 0).length;
    const preferredCount = items.filter((plan) => plan.hasPreferred).length;

    return NextResponse.json({
      plans: items,
      planCount: plans.length,
      generatedPlanCount,
      preferredCount,
      missingPreferredPlans,
      zipReady: plans.length === REQUIRED_PLAN_COUNT && preferredCount === REQUIRED_PLAN_COUNT,
    });
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "未登录或无权访问" }, { status: 401 });
    }
    return NextResponse.json(
      { code: "GENERATION_SUMMARY_FAILED", error: "无法读取生成进度" },
      { status: 500 },
    );
  }
}
