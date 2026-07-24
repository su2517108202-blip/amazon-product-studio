import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { statStoredFile } from "@/lib/storage";

export async function DELETE(_req, context) {
  try {
    const { imageId } = await context.params;
    const user = await requireCurrentUser();

    const image = await prisma.generatedImage.findFirst({
      where: { id: imageId, deletedAt: null, project: { userId: user.id } },
      include: {
        imagePlan: {
          select: { id: true, preferredGeneratedImageId: true },
        },
      },
    });
    if (!image) {
      return NextResponse.json(
        { code: "GENERATED_IMAGE_NOT_FOUND", error: "未找到生成图片" },
        { status: 404 },
      );
    }
    if (image.imagePlan.preferredGeneratedImageId === image.id) {
      return NextResponse.json(
        { code: "PREFERRED_IMAGE_DELETE_BLOCKED", error: "首选图不能直接删除" },
        { status: 409 },
      );
    }

    const file = await statStoredFile(image.storageKey, image.localPath).catch(() => null);
    if (!file?.stat?.isFile()) {
      return NextResponse.json(
        { code: "GENERATED_FILE_NOT_FOUND", error: "Generated image file is missing" },
        { status: 404 },
      );
    }

    const deletedAt = new Date();
    const updated = await prisma.generatedImage.updateMany({
      where: { id: image.id, deletedAt: null },
      data: { deletedAt },
    });
    if (updated.count !== 1) {
      return NextResponse.json(
        { code: "GENERATED_IMAGE_NOT_FOUND", error: "未找到生成图片" },
        { status: 404 },
      );
    }

    try {
      await fs.rm(file.filePath, { force: false });
    } catch {
      await prisma.generatedImage
        .updateMany({ where: { id: image.id, deletedAt }, data: { deletedAt: null } })
        .catch(() => {});
      return NextResponse.json(
        { code: "GENERATED_FILE_DELETE_FAILED", error: "无法删除生成图片文件" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, id: image.id, deletedAt });
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "未登录或无权访问" }, { status: 401 });
    }
    return NextResponse.json(
      { code: "GENERATED_FILE_DELETE_FAILED", error: "无法删除生成图片" },
      { status: 500 },
    );
  }
}
