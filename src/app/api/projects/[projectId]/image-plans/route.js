import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { imagePlanToResponse } from "@/lib/image-planning";

export async function GET(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: {
        productIdentity: true,
        imagePlans: { orderBy: { planIndex: "asc" } },
        planningRuns: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const plans = project.imagePlans.map(imagePlanToResponse);
    const successfulRuns = project.planningRuns.filter((run) => run.status === "completed");
    const failedRuns = project.planningRuns.filter((run) => run.status === "failed");
    const lastRun = project.planningRuns[0] || null;

    return NextResponse.json({
      plans,
      planCount: plans.length,
      hasCompletePlanSet: plans.length === 5,
      hasStalePlans: plans.some((plan) => plan.isStale),
      identityStatus: {
        exists: Boolean(project.productIdentity),
        isStale: Boolean(project.productIdentity?.isStale),
      },
      stats: {
        successCount: successfulRuns.length,
        failureCount: failedRuns.length,
        lastProvider: lastRun?.provider || "",
        lastModel: lastRun?.model || "",
        lastDurationMs: lastRun?.durationMs ?? null,
        lastRunStatus: lastRun?.status || "",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to read image plans" },
      { status: error.status || 500 },
    );
  }
}
