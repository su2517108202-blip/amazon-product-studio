import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { deleteProjectStorage } from "@/lib/storage";
import { sanitizeProject } from "@/lib/projects";

async function getProjectForUser(projectId, userId) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      referenceImages: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function GET(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await getProjectForUser(projectId, user.id);

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    return NextResponse.json(sanitizeProject(project));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取项目" },
      { status: error.status || 500 },
    );
  }
}

export async function PATCH(req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const existing = await getProjectForUser(projectId, user.id);

    if (!existing) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const body = await req.json();
    const planningInputsChanged =
      (body.platform !== undefined && body.platform !== existing.platform) ||
      (body.aspectRatio !== undefined && body.aspectRatio !== existing.aspectRatio) ||
      (body.name !== undefined && (body.name || "").trim() !== existing.name) ||
      (body.productName !== undefined &&
        ((body.productName || "").trim() || null) !== existing.productName) ||
      (body.notes !== undefined && ((body.notes || "").trim() || null) !== existing.notes);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: body.name === undefined ? undefined : (body.name || "").trim(),
        productName:
          body.productName === undefined
            ? undefined
            : (body.productName || "").trim() || null,
        platform: body.platform,
        aspectRatio: body.aspectRatio,
        notes:
          body.notes === undefined ? undefined : (body.notes || "").trim() || null,
      },
      include: {
        referenceImages: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (planningInputsChanged) {
      await prisma.imagePlan.updateMany({
        where: { projectId },
        data: { isStale: true },
      });
    }

    return NextResponse.json(sanitizeProject(project));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法更新项目" },
      { status: error.status || 500 },
    );
  }
}

export async function DELETE(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const existing = await getProjectForUser(projectId, user.id);

    if (!existing) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    await deleteProjectStorage(projectId);
    await prisma.project.delete({
      where: { id: projectId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { code: "PROJECT_DELETE_FAILED", error: error.message || "无法删除项目" },
      { status: error.status || 500 },
    );
  }
}
