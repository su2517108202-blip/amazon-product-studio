import { promises as fs } from "fs";
import path from "path";

export const storageRoot = path.join(process.cwd(), "storage");

export function sanitizeFileName(fileName) {
  const ext = path.extname(fileName || "").toLowerCase();
  const base = path
    .basename(fileName || "image", ext)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "image"}-${Date.now()}${ext || ".png"}`;
}

export function getProjectReferenceDir(projectId) {
  return path.join(storageRoot, "projects", projectId, "references");
}

export function getProjectDir(projectId) {
  return path.join(storageRoot, "projects", projectId);
}

export function getStorageKey(projectId, fileName) {
  return `projects/${projectId}/references/${fileName}`;
}

export function getPublicStorageUrl(storageKey) {
  return `/api/storage/${storageKey}`;
}

export async function saveProjectReference(projectId, file) {
  const dir = getProjectReferenceDir(projectId);
  await fs.mkdir(dir, { recursive: true });

  const fileName = sanitizeFileName(file.name);
  const localPath = path.join(dir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(localPath, buffer);

  const storageKey = getStorageKey(projectId, fileName);
  return {
    fileName,
    localPath,
    storageKey,
    url: getPublicStorageUrl(storageKey),
  };
}

export async function deleteProjectStorage(projectId) {
  await fs.rm(getProjectDir(projectId), { recursive: true, force: true });
}

export function resolveStoragePath(parts) {
  const target = path.resolve(storageRoot, ...parts);
  if (!target.startsWith(storageRoot)) {
    throw new Error("Invalid storage path");
  }
  return target;
}
