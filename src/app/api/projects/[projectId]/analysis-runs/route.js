import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { runToResponse } from "@/lib/product-analysis";

export async function GET(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const runs = await prisma.productAnalysisRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(runs.map(runToResponse));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取识别记录" },
      { status: error.status || 500 },
    );
  }
}
