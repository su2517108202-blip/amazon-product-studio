import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { sanitizeReferenceImage } from "@/lib/projects";

export async function PATCH(req, context) {
  try {
    const { imageId } = await context.params;
    const user = await requireCurrentUser();
    const body = await req.json();

    const updated = await prisma.$transaction(async (tx) => {
      const image = await tx.referenceImage.findFirst({
        where: {
          id: imageId,
          project: { userId: user.id },
        },
        include: { project: true },
      });

      if (!image) {
        return null;
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${image.projectId}))`;

      const data = {};
      if (typeof body.imageRole === "string") data.imageRole = body.imageRole;
      if (body.isPrimary === true) {
        data.isPrimary = true;
        data.includeInAnalysis = true;
        data.includeInGeneration = true;
        await tx.referenceImage.updateMany({
          where: { projectId: image.projectId, id: { not: imageId }, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      if (typeof body.includeInAnalysis === "boolean" || body.isPrimary === true) {
        data.includeInAnalysis = body.isPrimary === true ? true : body.includeInAnalysis;
      }
      if (typeof body.includeInGeneration === "boolean" || body.isPrimary === true) {
        data.includeInGeneration = body.isPrimary === true ? true : body.includeInGeneration;
      }

      const nextImage = await tx.referenceImage.update({
        where: { id: imageId },
        data,
      });

      if (body.isPrimary === true) {
        await tx.project.update({
          where: { id: image.projectId },
          data: { coverImageUrl: nextImage.url },
        });
      }

      await tx.productIdentity.updateMany({
        where: { projectId: image.projectId },
        data: { isStale: true },
      });
      await tx.imagePlan.updateMany({
        where: { projectId: image.projectId },
        data: { isStale: true },
      });

      return nextImage;
    });

    if (!updated) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    }

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
    const deleted = await prisma.$transaction(async (tx) => {
      const image = await tx.referenceImage.findFirst({
        where: {
          id: imageId,
          project: { userId: user.id },
        },
        include: { project: true },
      });

      if (!image) return null;

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${image.projectId}))`;

      await tx.referenceImage.delete({ where: { id: imageId } });

      let nextPrimary = null;
      if (image.isPrimary) {
        nextPrimary = await tx.referenceImage.findFirst({
          where: { projectId: image.projectId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });

        await tx.project.update({
          where: { id: image.projectId },
          data: { coverImageUrl: nextPrimary?.url || null },
        });

        if (nextPrimary) {
          await tx.referenceImage.update({
            where: { id: nextPrimary.id },
            data: {
              isPrimary: true,
              includeInAnalysis: true,
              includeInGeneration: true,
            },
          });
        }
      }

      await tx.productIdentity.updateMany({
        where: { projectId: image.projectId },
        data: { isStale: true },
      });
      await tx.imagePlan.updateMany({
        where: { projectId: image.projectId },
        data: { isStale: true },
      });

      return image;
    });

    if (!deleted) {
      return NextResponse.json({ code: "REFERENCE_IMAGE_NOT_FOUND", error: "图片不存在" }, { status: 404 });
    }

    if (deleted.localPath) {
      await fs.rm(deleted.localPath, { force: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { code: "REFERENCE_IMAGE_DELETE_FAILED", error: error.message || "无法删除图片" },
      { status: error.status || 500 },
    );
  }
}
