import { execFile } from "child_process";
import { NextResponse } from "next/server";
import {
  checkStorageRoot,
  defaultStorageRoot,
  isLocalSettingsAllowed,
  readLocalSettings,
  redactStorageRootForClient,
  resetLocalSettings,
  writeLocalSettings,
} from "@/lib/local-settings";

export async function GET() {
  const settings = await readLocalSettings();
  return NextResponse.json({
    isLocalMode: isLocalSettingsAllowed(),
    storageRoot: redactStorageRootForClient(settings.storageRoot),
    defaultStorageRoot: redactStorageRootForClient(defaultStorageRoot),
    needsRestart: false,
  });
}

export async function POST(req) {
  try {
    if (!isLocalSettingsAllowed()) {
      return NextResponse.json({ error: "只有本地模式可以修改素材存放路径" }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action || "check";
    if (action === "check") {
      return NextResponse.json(await checkStorageRoot(body.storageRoot, { create: Boolean(body.create) }));
    }
    if (action === "save") {
      await checkStorageRoot(body.storageRoot, { create: Boolean(body.create) });
      const settings = await writeLocalSettings({ storageRoot: body.storageRoot });
      return NextResponse.json({
        ok: true,
        storageRoot: settings.storageRoot,
        message: "素材存放路径已保存，新文件会写入新路径。",
        needsRestart: false,
      });
    }
    if (action === "reset") {
      const settings = await resetLocalSettings();
      return NextResponse.json({
        ok: true,
        storageRoot: settings.storageRoot,
        message: "已恢复默认素材路径。",
        needsRestart: false,
      });
    }
    if (action === "open") {
      const settings = await readLocalSettings();
      await checkStorageRoot(settings.storageRoot, { create: true });
      if (process.platform === "win32") {
        execFile("explorer.exe", [settings.storageRoot], { windowsHide: false });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法处理素材路径设置" },
      { status: error.status || 500 },
    );
  }
}
