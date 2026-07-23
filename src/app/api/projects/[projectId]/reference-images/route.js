import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import {
  deleteStoredFile,
  detectImageMime,
  MAX_REFERENCE_IMAGE_BYTES,
  saveProjectReference,
} from "@/lib/storage";
import { sanitizeReferenceImage } from "@/lib/projects";

const MAX_REFERENCE_IMAGES = 14;
const ALLOWED_REFERENCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class UploadError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.publicMessage = message;
  }
}

export async function POST(req, context) {
  const storedFiles = [];

  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: { referenceImages: true },
    });

    if (!project) {
      throw new UploadError("PROJECT_NOT_FOUND", "项目不存在", 404);
    }

    const formData = await req.formData();
    const files = formData
      .getAll("files")
      .filter((file) => file && typeof file === "object" && typeof file.arrayBuffer === "function");
    const imageRole = String(formData.get("imageRole") || "other");

    if (files.length === 0) {
      throw new UploadError("NO_FILES", "请选择要上传的图片");
    }

    if (project.referenceImages.length + files.length > MAX_REFERENCE_IMAGES) {
      throw new UploadError(
        "TOO_MANY_REFERENCE_IMAGES",
        `一个项目最多上传 ${MAX_REFERENCE_IMAGES} 张参考图`,
        409,
      );
    }

    const preparedFiles = [];
    for (const file of files) {
      preparedFiles.push(await prepareReferenceUpload(file));
    }

    for (const item of preparedFiles) {
      const stored = await saveProjectReference(projectId, item.file, item.buffer, item.mimeType);
      storedFiles.push(stored);
    }

    const savedImages = await prisma.$transaction(async (tx) => {
      const created = [];
      let sortOrder = project.referenceImages.length;

      for (const [index, item] of preparedFiles.entries()) {
        const stored = storedFiles[index];
        const nextIndex = project.referenceImages.length + created.length;
        const isPrimary = nextIndex === 0;
        const image = await tx.referenceImage.create({
          data: {
            projectId,
            url: stored.url,
            localPath: stored.localPath,
            storageKey: stored.storageKey,
            fileName: item.originalName,
            mimeType: item.mimeType,
            sortOrder,
            isPrimary,
            includeInAnalysis: nextIndex < 8,
            includeInGeneration: isPrimary,
            imageRole,
          },
        });

        if (isPrimary) {
          await tx.project.update({
            where: { id: projectId },
            data: { coverImageUrl: image.url },
          });
        }

        created.push(image);
        sortOrder += 1;
      }

      await tx.productIdentity.updateMany({
        where: { projectId },
        data: { isStale: true },
      });
      await tx.imagePlan.updateMany({
        where: { projectId },
        data: { isStale: true },
      });

      return created;
    });

    return NextResponse.json(savedImages.map(sanitizeReferenceImage), { status: 201 });
  } catch (error) {
    await cleanupStoredFiles(storedFiles);
    return uploadErrorResponse(error);
  }
}

async function prepareReferenceUpload(file) {
  const originalName = sanitizeOriginalFileName(file.name);
  const declaredType = String(file.type || "").toLowerCase();

  if (typeof file.size === "number" && file.size === 0) {
    throw new UploadError("EMPTY_FILE", `“${originalName}” 是空文件，请选择有效图片`);
  }

  if (typeof file.size === "number" && file.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new UploadError(
      "IMAGE_TOO_LARGE",
      `“${originalName}” 超过 12MB，请压缩后再上传`,
      413,
    );
  }

  if (declaredType && !ALLOWED_REFERENCE_MIME_TYPES.has(declaredType)) {
    throw new UploadError(
      "UNSUPPORTED_IMAGE_TYPE",
      `“${originalName}” 不是支持的图片格式，仅支持 JPG、PNG、WebP`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    throw new UploadError("EMPTY_FILE", `“${originalName}” 是空文件，请选择有效图片`);
  }
  if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new UploadError(
      "IMAGE_TOO_LARGE",
      `“${originalName}” 超过 12MB，请压缩后再上传`,
      413,
    );
  }

  const detectedType = detectImageMime(buffer);
  if (!ALLOWED_REFERENCE_MIME_TYPES.has(detectedType)) {
    throw new UploadError(
      "INVALID_IMAGE_SIGNATURE",
      `“${originalName}” 的文件内容不是有效的 JPG、PNG 或 WebP 图片`,
    );
  }

  if (declaredType && declaredType !== detectedType) {
    throw new UploadError(
      "IMAGE_TYPE_MISMATCH",
      `“${originalName}” 的文件类型与实际图片内容不一致`,
    );
  }

  return {
    file,
    originalName,
    buffer,
    mimeType: detectedType,
  };
}

function sanitizeOriginalFileName(value) {
  return String(value || "未命名图片")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\\/]/g, "")
    .trim()
    .slice(0, 120) || "未命名图片";
}

async function cleanupStoredFiles(storedFiles) {
  await Promise.all(
    storedFiles.map((stored) => deleteStoredFile(stored.storageKey).catch(() => {})),
  );
}

function uploadErrorResponse(error) {
  if (error instanceof UploadError) {
    return NextResponse.json(
      { code: error.code, error: error.publicMessage },
      { status: error.status },
    );
  }

  console.error("[reference-upload] failed", {
    code: error?.code || "REFERENCE_UPLOAD_FAILED",
    name: error?.name,
  });

  return NextResponse.json(
    { code: "REFERENCE_UPLOAD_FAILED", error: "图片上传失败，请稍后重试" },
    { status: 500 },
  );
}
