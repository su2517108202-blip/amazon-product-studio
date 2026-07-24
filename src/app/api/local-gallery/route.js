import sharp from "sharp";
import { NextResponse } from "next/server";
import { isLocalMode, requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { getPublicStorageUrl, readStoredFile, statStoredFile } from "@/lib/storage";

export async function GET(req) {
  try {
    if (!isLocalMode()) {
      return NextResponse.json({ error: "本地素材库只在本地模式可用" }, { status: 403 });
    }

    const user = await requireCurrentUser();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || "";
    const where = { userId: user.id, ...(projectId ? { id: projectId } : {}) };

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        referenceImages: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        imagePlans: {
          orderBy: { planIndex: "asc" },
          include: {
            generatedImages: {
              where: { deletedAt: null },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            },
            preferredGeneratedImage: true,
          },
        },
      },
    });

    const items = [];
    for (const project of projects) {
      for (const reference of project.referenceImages) {
        const meta = await referenceMetadata(reference);
        items.push({
          id: reference.id,
          kind: "reference",
          typeLabel: reference.isPrimary ? "参考图 · 主图" : `参考图 · ${reference.imageRole || "其他"}`,
          projectId: project.id,
          projectName: project.name,
          url: reference.url,
          downloadUrl: reference.url,
          planIndex: null,
          candidateNumber: null,
          isPreferred: reference.isPrimary,
          createdAt: reference.createdAt,
          width: meta.width,
          height: meta.height,
          byteSize: meta.byteSize,
          canDelete: false,
        });
      }

      for (const plan of project.imagePlans) {
        const preferredId = plan.preferredGeneratedImageId || "";
        for (const [index, image] of plan.generatedImages.entries()) {
          items.push({
            id: image.id,
            kind: "generated",
            typeLabel: `图${plan.planIndex} · ${plan.taskType}`,
            projectId: project.id,
            projectName: project.name,
            url: getPublicStorageUrl(image.storageKey),
            downloadUrl: `/api/generated-images/${image.id}/download`,
            planIndex: plan.planIndex,
            candidateNumber: index + 1,
            isPreferred: image.id === preferredId,
            createdAt: image.createdAt,
            width: image.width,
            height: image.height,
            byteSize: image.byteSize,
            canDelete: image.id !== preferredId,
          });
        }
      }
    }

    return NextResponse.json({
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
      items: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取本地素材库" },
      { status: error.status || 500 },
    );
  }
}

async function referenceMetadata(reference) {
  const fallback = { width: null, height: null, byteSize: null };
  const stat = await statStoredFile(reference.storageKey, reference.localPath).catch(() => null);
  const file = await readStoredFile(reference.storageKey, reference.localPath).catch(() => null);
  if (!file) return { ...fallback, byteSize: stat?.stat?.size || null };
  const metadata = await sharp(file.buffer).metadata().catch(() => ({}));
  return {
    width: metadata.width || null,
    height: metadata.height || null,
    byteSize: stat?.stat?.size || file.buffer.length,
  };
}
