import fsSync, { constants as fsConstants, promises as fs } from "fs";
import os from "os";
import path from "path";
import config from "@/lib/config";

export const defaultStorageRoot = path.join(process.cwd(), "storage");

function localSettingsFile() {
  const base =
    process.env.LINGTU_LOCAL_CONFIG_DIR ||
    (process.env.APPDATA
      ? path.join(process.env.APPDATA, "LingtuAmazonStudio")
      : path.join(os.homedir(), ".lingtu-amazon-studio"));
  return path.join(base, "local-settings.json");
}

export function isLocalSettingsAllowed() {
  return config.app.mode === "local";
}

export async function readLocalSettings() {
  if (!isLocalSettingsAllowed()) {
    return { storageRoot: defaultStorageRoot };
  }

  try {
    const raw = await fs.readFile(localSettingsFile(), "utf8");
    const parsed = JSON.parse(raw);
    const storageRoot = normalizeStorageRoot(parsed.storageRoot || defaultStorageRoot);
    return { storageRoot };
  } catch {
    return { storageRoot: defaultStorageRoot };
  }
}

export function readLocalSettingsSync() {
  if (!isLocalSettingsAllowed()) {
    return { storageRoot: defaultStorageRoot };
  }

  try {
    const raw = fsSync.readFileSync(localSettingsFile(), "utf8");
    const parsed = JSON.parse(raw);
    const storageRoot = normalizeStorageRoot(parsed.storageRoot || defaultStorageRoot);
    return { storageRoot };
  } catch {
    return { storageRoot: defaultStorageRoot };
  }
}

export async function writeLocalSettings(settings) {
  assertLocalMode();
  const storageRoot = normalizeStorageRoot(settings.storageRoot || defaultStorageRoot);
  await assertSafeStorageRoot(storageRoot);
  const file = localSettingsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ storageRoot }, null, 2), "utf8");
  return { storageRoot };
}

export async function resetLocalSettings() {
  assertLocalMode();
  const file = localSettingsFile();
  await fs.rm(file, { force: true });
  return { storageRoot: defaultStorageRoot };
}

export function normalizeStorageRoot(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("请填写素材存放路径");
  if (!path.isAbsolute(input)) throw new Error("素材存放路径必须是系统绝对路径");
  const resolved = path.resolve(input);
  if (resolved.includes("\0")) throw new Error("素材存放路径不合法");
  return resolved;
}

export async function assertSafeStorageRoot(storageRoot) {
  const resolved = normalizeStorageRoot(storageRoot);
  const dangerous = dangerousStorageRoots().map((item) => path.resolve(item).toLowerCase());
  const lower = resolved.toLowerCase();
  if (dangerous.includes(lower)) {
    throw new Error("不能把素材库设置为系统目录或磁盘根目录");
  }
  return resolved;
}

export async function checkStorageRoot(storageRoot, { create = false } = {}) {
  assertLocalMode();
  const resolved = await assertSafeStorageRoot(storageRoot);
  let exists = false;

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error("路径存在但不是文件夹");
    exists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!create) {
      return { ok: false, exists: false, canRead: false, canWrite: false, storageRoot: resolved };
    }
    await fs.mkdir(resolved, { recursive: true });
    exists = true;
  }

  await fs.access(resolved, fsConstants.R_OK | fsConstants.W_OK);
  const probe = path.join(resolved, `.lingtu-write-test-${process.pid}-${Date.now()}`);
  await fs.writeFile(probe, "ok", "utf8");
  await fs.rm(probe, { force: true });

  return { ok: true, exists, canRead: true, canWrite: true, storageRoot: resolved };
}

export function redactStorageRootForClient(storageRoot) {
  return isLocalSettingsAllowed() ? storageRoot : "";
}

function assertLocalMode() {
  if (!isLocalSettingsAllowed()) {
    const error = new Error("只有本地模式可以修改素材存放路径");
    error.status = 403;
    throw error;
  }
}

function dangerousStorageRoots() {
  const roots = new Set([path.parse(process.cwd()).root, os.homedir(), os.tmpdir()]);
  for (const value of [
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.USERPROFILE,
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
  ]) {
    if (value) roots.add(value);
  }
  return [...roots];
}
