import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { candidateDownloadFileName } from "@/lib/result-management";

export async function GET(_req, context) {
  try {
    const { imageId } = await context.params;
    const user = await requireCurrentUser();

    const image = await prisma.generatedImage.findFirst({
      where: { id: imageId, deletedAt: null, project: { userId: user.id } },
      include: {
        imagePlan: {
          select: { id: true, planIndex: true, taskType: true },
        },
      },
    });
    if (!image) {
      return NextResponse.json(
        { code: "GENERATED_IMAGE_NOT_FOUND", error: "未找到生成图片" },
        { status: 404 },
      );
    }

    const file = await readStoredFile(image.storageKey).catch(() => null);
    if (!file) {
      return NextResponse.json(
        { code: "GENERATED_FILE_NOT_FOUND", error: "Generated image file is missing" },
        { status: 404 },
      );
    }

    const candidateNumber = await prisma.generatedImage.count({
      where: {
        projectId: image.projectId,
        imagePlanId: image.imagePlanId,
        deletedAt: null,
        OR: [
          { createdAt: { lt: image.createdAt } },
          { createdAt: image.createdAt, id: { lte: image.id } },
        ],
      },
    });
    const fileName = candidateDownloadFileName(image, image.imagePlan, candidateNumber);

    return new Response(file.buffer, {
      headers: {
        "Content-Type": image.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(file.buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "未登录或无权访问" }, { status: 401 });
    }
    return NextResponse.json(
      { code: "DOWNLOAD_FAILED", error: "无法下载生成图片" },
      { status: 500 },
    );
  }
}
