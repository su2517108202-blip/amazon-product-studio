import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { saveProjectReference } from "@/lib/storage";
import { sanitizeReferenceImage } from "@/lib/projects";

const MAX_REFERENCE_IMAGES = 14;

export async function POST(req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: { referenceImages: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files").filter(Boolean);
    const imageRole = formData.get("imageRole") || "other";

    if (files.length === 0) {
      return NextResponse.json({ error: "请选择要上传的图片" }, { status: 400 });
    }

    if (project.referenceImages.length + files.length > MAX_REFERENCE_IMAGES) {
      return NextResponse.json(
        { error: "一个项目最多上传 14 张参考图" },
        { status: 400 },
      );
    }

    const created = [];
    let sortOrder = project.referenceImages.length;

    for (const file of files) {
      if (!file.type?.startsWith("image/")) {
        return NextResponse.json({ error: "只能上传图片文件" }, { status: 400 });
      }

      const stored = await saveProjectReference(projectId, file);
      const nextIndex = project.referenceImages.length + created.length;
      const isPrimary = nextIndex === 0;
      const image = await prisma.referenceImage.create({
        data: {
          projectId,
          url: stored.url,
          localPath: stored.localPath,
          storageKey: stored.storageKey,
          fileName: file.name,
          mimeType: file.type,
          sortOrder,
          isPrimary,
          includeInAnalysis: nextIndex < 8,
          imageRole,
        },
      });

      if (isPrimary) {
        await prisma.project.update({
          where: { id: projectId },
          data: { coverImageUrl: image.url },
        });
      }

      created.push(image);
      sortOrder += 1;
    }

    await prisma.productIdentity.updateMany({
      where: { projectId },
      data: { isStale: true },
    });

    return NextResponse.json(created.map(sanitizeReferenceImage), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "图片保存失败" },
      { status: error.status || 500 },
    );
  }
}
