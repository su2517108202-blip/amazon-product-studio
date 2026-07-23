import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { planningRunToResponse } from "@/lib/image-planning";

export async function GET(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const runs = await prisma.imagePlanningRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(runs.map(planningRunToResponse));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to read image planning runs" },
      { status: error.status || 500 },
    );
  }
}
