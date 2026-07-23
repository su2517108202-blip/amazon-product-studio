import { promises as fs } from "fs";
import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import path from "path";
import sharp from "sharp";
import { ProviderError, providerFetch } from "@/lib/providers/errors";

export const storageRoot = path.join(process.cwd(), "storage");
export const MAX_REFERENCE_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_REFERENCE_IMAGE_PIXELS = 50_000_000;
const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;

export function sanitizeFileName(fileName) {
  const ext = path.extname(fileName || "").toLowerCase();
  const base = path
    .basename(fileName || "image", ext)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "image"}-${Date.now()}${ext || ".png"}`;
}

export function createReferenceFileName(mimeType) {
  return `${crypto.randomUUID()}${imageExtension(mimeType)}`;
}

export function getProjectReferenceDir(projectId) {
  return path.join(storageRoot, "projects", projectId, "references");
}

export function getProjectGenerationDir(projectId, generationRunId) {
  return path.join(storageRoot, "projects", projectId, "generations", generationRunId);
}

export function getProjectDir(projectId) {
  return path.join(storageRoot, "projects", projectId);
}

export function getStorageKey(projectId, fileName) {
  return `projects/${projectId}/references/${fileName}`;
}

export function getGeneratedStorageKey(projectId, generationRunId, fileName) {
  return `projects/${projectId}/generations/${generationRunId}/${fileName}`;
}

export function getPublicStorageUrl(storageKey) {
  return `/api/storage/${storageKey}`;
}

export async function saveProjectReference(projectId, buffer, mimeType) {
  const dir = getProjectReferenceDir(projectId);
  await fs.mkdir(dir, { recursive: true });

  const fileName = createReferenceFileName(mimeType);
  const localPath = path.join(dir, fileName);
  await fs.writeFile(localPath, buffer);

  const storageKey = getStorageKey(projectId, fileName);
  return {
    fileName,
    localPath,
    storageKey,
    mimeType,
    url: getPublicStorageUrl(storageKey),
  };
}

export async function validateReferenceImageContent(buffer, mimeType) {
  let metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: "warning",
      limitInputPixels: MAX_REFERENCE_IMAGE_PIXELS,
    }).metadata();
  } catch {
    throw new ProviderError("INVALID_IMAGE_CONTENT", "图片文件无法完整解码");
  }

  const formatToMime = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  if (formatToMime[metadata.format] !== mimeType) {
    throw new ProviderError("INVALID_IMAGE_CONTENT", "图片内容与格式不一致");
  }
  if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) {
    throw new ProviderError("INVALID_IMAGE_CONTENT", "图片宽高无效");
  }
  if (metadata.width * metadata.height > MAX_REFERENCE_IMAGE_PIXELS) {
    throw new ProviderError("INVALID_IMAGE_CONTENT", "图片像素尺寸过大");
  }

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
  };
}

export async function saveGeneratedImage(projectId, generationRunId, imageId, buffer, sourceType) {
  const mimeType = detectImageMime(buffer);
  if (!mimeType) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Provider did not return a valid image");
  }
  if (buffer.length > MAX_GENERATED_IMAGE_BYTES) {
    throw new ProviderError("IMAGE_TOO_LARGE", "Generated image is too large");
  }

  const dir = getProjectGenerationDir(projectId, generationRunId);
  await fs.mkdir(dir, { recursive: true });

  const ext = imageExtension(mimeType);
  const fileName = `${imageId}${ext}`;
  const localPath = path.join(dir, fileName);
  await fs.writeFile(localPath, buffer);

  const dimensions = readImageDimensions(buffer, mimeType);
  return {
    storageKey: getGeneratedStorageKey(projectId, generationRunId, fileName),
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    sourceType,
    url: getPublicStorageUrl(getGeneratedStorageKey(projectId, generationRunId, fileName)),
  };
}

export async function downloadImageToBuffer(url, { timeoutMs = 30000 } = {}) {
  await assertSafeRemoteUrl(url);

  const response = await providerFetch(url, {
    method: "GET",
    timeoutMs,
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) {
    throw new ProviderError("IMAGE_DOWNLOAD_FAILED", "Image download redirect was blocked");
  }
  if (!response.ok) {
    throw new ProviderError("IMAGE_DOWNLOAD_FAILED", "无法下载生成图片", {
      httpStatus: response.status,
    });
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_GENERATED_IMAGE_BYTES) {
    throw new ProviderError("IMAGE_TOO_LARGE", "Generated image is too large");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_GENERATED_IMAGE_BYTES) {
    throw new ProviderError("IMAGE_TOO_LARGE", "Generated image is too large");
  }
  if (!detectImageMime(buffer)) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Downloaded content is not an image");
  }

  return buffer;
}

export async function deleteProjectStorage(projectId) {
  await fs.rm(getProjectDir(projectId), { recursive: true, force: true });
}

export function resolveStoragePath(parts) {
  const safeParts = normalizeStorageParts(parts);
  const root = path.resolve(storageRoot);
  const target = path.resolve(root, ...safeParts);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid storage path");
  }
  return target;
}

export async function deleteStoredFile(storageKey) {
  const filePath = resolveStoragePath(String(storageKey || "").split("/"));
  await fs.rm(filePath, { force: true });
}

export async function readStoredFile(storageKey) {
  const filePath = resolveStoragePath(String(storageKey || "").split("/"));
  return {
    filePath,
    buffer: await fs.readFile(filePath),
  };
}

export async function statStoredFile(storageKey) {
  const filePath = resolveStoragePath(String(storageKey || "").split("/"));
  return {
    filePath,
    stat: await fs.stat(filePath),
  };
}

function normalizeStorageParts(parts = []) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Invalid storage path");
  }

  return parts.map((part) => {
    const decoded = decodeStoragePart(part);
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      throw new Error("Invalid storage path");
    }
    return decoded;
  });
}

function decodeStoragePart(part) {
  let decoded = String(part || "");
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return next;
      decoded = next;
    } catch {
      throw new Error("Invalid storage path");
    }
  }
  return decoded;
}

export function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  return "";
}

export function imageExtension(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".png";
}

function readImageDimensions(buffer, mimeType) {
  try {
    if (mimeType === "image/png" && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === "image/webp") return readWebpDimensions(buffer);
    if (mimeType === "image/jpeg") return readJpegDimensions(buffer);
  } catch {}
  return { width: null, height: null };
}

function readJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return { width: null, height: null };
}

function readWebpDimensions(buffer) {
  const kind = buffer.subarray(12, 16).toString("ascii");
  if (kind === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  return { width: null, height: null };
}

async function assertSafeRemoteUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProviderError("UNSAFE_REMOTE_URL", "Generated image URL is invalid");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ProviderError("UNSAFE_REMOTE_URL", "Generated image URL protocol is not allowed");
  }

  const addresses = net.isIP(parsed.hostname)
    ? [{ address: parsed.hostname }]
    : await dns.lookup(parsed.hostname, { all: true });

  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new ProviderError("UNSAFE_REMOTE_URL", "Generated image URL points to a private address");
  }
}

function isPrivateAddress(address) {
  if (address === "::1" || address.toLowerCase().startsWith("fe80:")) return true;
  if (address.startsWith("fc") || address.startsWith("fd")) return true;
  if (address.startsWith("::ffff:")) return isPrivateAddress(address.slice(7));

  const parts = address.split(".").map((item) => Number(item));
  if (parts.length !== 4 || parts.some((item) => Number.isNaN(item))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}
