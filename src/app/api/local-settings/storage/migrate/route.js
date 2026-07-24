import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isLocalMode, requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import { checkStorageRoot, writeLocalSettings } from "@/lib/local-settings";
import { resolveStoredFilePath } from "@/lib/storage";

export async function POST(req) {
  try {
    if (!isLocalMode()) {
      return NextResponse.json({ error: "只有本地模式可以迁移素材" }, { status: 403 });
    }

    const user = await requireCurrentUser();
    const body = await req.json();
    const target = await checkStorageRoot(body.storageRoot, { create: Boolean(body.create) });
    const records = await collectRecords(user.id, target.storageRoot);
    const totalBytes = records.reduce((sum, item) => sum + item.byteSize, 0);

    if (!body.confirm) {
      return NextResponse.json({
        ok: false,
        requiresConfirmation: true,
        fileCount: records.length,
        totalBytes,
      });
    }

    const copied = [];
    for (const record of records) {
      await fs.mkdir(path.dirname(record.targetPath), { recursive: true });
      await fs.copyFile(record.sourcePath, record.targetPath);
      const stat = await fs.stat(record.targetPath);
      if (stat.size !== record.byteSize) {
        throw new Error("迁移校验失败，文件大小不一致");
      }
      copied.push(record);
    }

    await prisma.$transaction(async (tx) => {
      for (const record of copied) {
        if (record.kind === "reference") {
          await tx.referenceImage.update({
            where: { id: record.id },
            data: { localPath: record.targetPath },
          });
        } else {
          await tx.generatedImage.update({
            where: { id: record.id },
            data: { localPath: record.targetPath },
          });
        }
      }
    });
    await writeLocalSettings({ storageRoot: target.storageRoot });

    return NextResponse.json({
      ok: true,
      fileCount: copied.length,
      totalBytes,
      message: "迁移完成，旧目录已保留。",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "素材迁移失败，旧路径仍可继续使用" },
      { status: error.status || 500 },
    );
  }
}

async function collectRecords(userId, targetRoot) {
  const [references, generated] = await Promise.all([
    prisma.referenceImage.findMany({
      where: { project: { userId } },
      select: { id: true, storageKey: true, localPath: true },
    }),
    prisma.generatedImage.findMany({
      where: { project: { userId }, deletedAt: null },
      select: { id: true, storageKey: true, localPath: true },
    }),
  ]);

  const records = [];
  for (const item of [
    ...references.map((record) => ({ ...record, kind: "reference" })),
    ...generated.map((record) => ({ ...record, kind: "generated" })),
  ]) {
    const sourcePath = await resolveStoredFilePath(item.storageKey, item.localPath).catch(() => null);
    if (!sourcePath) continue;
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat?.isFile()) continue;
    const targetPath = path.resolve(targetRoot, ...String(item.storageKey || "").split("/"));
    records.push({ ...item, sourcePath, targetPath, byteSize: stat.size });
  }
  return records;
}
