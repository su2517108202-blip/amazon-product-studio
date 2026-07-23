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
      return NextResponse.json({ error: "未找到项目" }, { status: 404 });
    }

    const runs = await prisma.imagePlanningRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(runs.map(planningRunToResponse));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取策划记录" },
      { status: error.status || 500 },
    );
  }
}
