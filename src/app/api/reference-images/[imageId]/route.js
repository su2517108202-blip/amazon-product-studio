import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { sanitizeReferenceImage } from "@/lib/projects";

async function getImageForUser(imageId, userId) {
  return prisma.referenceImage.findFirst({
    where: {
      id: imageId,
      project: { userId },
    },
    include: { project: true },
  });
}

export async function PATCH(req, context) {
  try {
    const { imageId } = await context.params;
    const user = await requireCurrentUser();
    const image = await getImageForUser(imageId, user.id);

    if (!image) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    }

    const body = await req.json();

    if (body.isPrimary === true) {
      await prisma.referenceImage.updateMany({
        where: { projectId: image.projectId },
        data: { isPrimary: false },
      });
    }

    const updated = await prisma.referenceImage.update({
      where: { id: imageId },
      data: {
        imageRole: body.imageRole,
        isPrimary: body.isPrimary,
        includeInAnalysis:
          body.isPrimary === true ? true : body.includeInAnalysis,
      },
    });

    if (body.isPrimary === true) {
      await prisma.project.update({
        where: { id: image.projectId },
        data: { coverImageUrl: updated.url },
      });
    }

    await prisma.productIdentity.updateMany({
      where: { projectId: image.projectId },
      data: { isStale: true },
    });

    return NextResponse.json(sanitizeReferenceImage(updated));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法更新图片" },
      { status: error.status || 500 },
    );
  }
}

export async function DELETE(_req, context) {
  try {
    const { imageId } = await context.params;
    const user = await requireCurrentUser();
    const image = await getImageForUser(imageId, user.id);

    if (!image) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    }

    await prisma.referenceImage.delete({
      where: { id: imageId },
    });

    await prisma.productIdentity.updateMany({
      where: { projectId: image.projectId },
      data: { isStale: true },
    });

    if (image.localPath) {
      await fs.rm(image.localPath, { force: true });
    }

    if (image.isPrimary) {
      const nextPrimary = await prisma.referenceImage.findFirst({
        where: { projectId: image.projectId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });

      await prisma.project.update({
        where: { id: image.projectId },
        data: { coverImageUrl: nextPrimary?.url || null },
      });

      if (nextPrimary) {
        await prisma.referenceImage.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法删除图片" },
      { status: error.status || 500 },
    );
  }
}
