import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import {
  getProjectReferenceDir,
  getPublicStorageUrl,
  getStorageKey,
} from "@/lib/storage";
import { sanitizeProject } from "@/lib/projects";

export async function POST(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const source = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: {
        referenceImages: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const copy = await prisma.project.create({
      data: {
        userId: user.id,
        name: `${source.name} 副本`,
        productName: source.productName,
        platform: source.platform,
        aspectRatio: source.aspectRatio,
        notes: source.notes,
        status: source.status,
        coverImageUrl: source.coverImageUrl,
      },
    });

    const targetDir = getProjectReferenceDir(copy.id);
    await fs.mkdir(targetDir, { recursive: true });
    let copiedCoverImageUrl = null;

    for (const image of source.referenceImages) {
      const newFileName = `${copy.id}-${image.fileName}`;
      const targetPath = path.join(targetDir, newFileName);

      if (image.localPath) {
        await fs.copyFile(image.localPath, targetPath);
      }

      const storageKey = getStorageKey(copy.id, newFileName);
      const url = getPublicStorageUrl(storageKey);
      await prisma.referenceImage.create({
        data: {
          projectId: copy.id,
          url,
          localPath: targetPath,
          storageKey,
          fileName: image.fileName,
          mimeType: image.mimeType,
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
          includeInAnalysis: image.includeInAnalysis,
          includeInGeneration: image.includeInGeneration,
          imageRole: image.imageRole,
        },
      });

      if (image.isPrimary) {
        copiedCoverImageUrl = url;
      }
    }

    if (copiedCoverImageUrl) {
      await prisma.project.update({
        where: { id: copy.id },
        data: { coverImageUrl: copiedCoverImageUrl },
      });
    }

    const duplicated = await prisma.project.findUnique({
      where: { id: copy.id },
      include: {
        _count: {
          select: { referenceImages: true, imagePlans: true },
        },
        imagePlans: {
          select: { id: true, isStale: true },
        },
      },
    });

    return NextResponse.json(sanitizeProject(duplicated), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法复制项目" },
      { status: error.status || 500 },
    );
  }
}
