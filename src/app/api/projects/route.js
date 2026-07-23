import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { sanitizeProject } from "@/lib/projects";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { referenceImages: true, imagePlans: true },
        },
        imagePlans: {
          select: { id: true, isStale: true },
        },
      },
    });

    return NextResponse.json(projects.map(sanitizeProject));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取项目" },
      { status: error.status || 500 },
    );
  }
}

export async function POST(req) {
  try {
    const user = await requireCurrentUser();
    const body = await req.json();
    const name = (body.name || "").trim();

    if (!name) {
      return NextResponse.json({ error: "请填写项目名称" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name,
        productName: (body.productName || "").trim() || null,
        platform: body.platform || "通用电商",
        aspectRatio: body.aspectRatio || "1:1",
        notes: (body.notes || "").trim() || null,
      },
      include: {
        _count: {
          select: { referenceImages: true, imagePlans: true },
        },
        imagePlans: {
          select: { id: true, isStale: true },
        },
      },
    });

    return NextResponse.json(sanitizeProject(project), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法创建项目" },
      { status: error.status || 500 },
    );
  }
}
