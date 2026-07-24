import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";

export async function GET(_req, context) {
  try {
    const params = await context.params;
    const parts = params.path || [];
    const user = await requireCurrentUser();
    const access = await assertStorageAccess(parts, user.id);
    const stored = await readStoredFile(access.storageKey, access.localPath);

    return new Response(stored.buffer, {
      headers: {
        "Content-Type": getContentType(stored.filePath),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "未登录或无权访问" }, { status: 401 });
    }
    return NextResponse.json(
      { code: "STORAGE_FILE_NOT_FOUND", error: "文件不存在或无权访问" },
      { status: 404 },
    );
  }
}

async function assertStorageAccess(parts, userId) {
  const key = parts.join("/");
  const [scope, projectId, kind, runIdOrFile, maybeFile] = parts;

  if (scope !== "projects" || !projectId) {
    throw new Error("Invalid storage path");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) {
    throw new Error("Invalid storage path");
  }

  if (kind === "references" && parts.length === 4 && runIdOrFile) {
    const reference = await prisma.referenceImage.findFirst({
      where: { projectId, storageKey: key },
      select: { id: true, storageKey: true, localPath: true },
    });
    if (!reference) throw new Error("Invalid storage path");
    return reference;
  }

  if (kind === "generations" && parts.length === 5 && runIdOrFile && maybeFile) {
    const generated = await prisma.generatedImage.findFirst({
      where: {
        projectId,
        generationRunId: runIdOrFile,
        storageKey: key,
        deletedAt: null,
      },
      select: { id: true, storageKey: true, localPath: true },
    });
    if (!generated) throw new Error("Invalid storage path");
    return generated;
  }

  throw new Error("Invalid storage path");
}

function getContentType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}
