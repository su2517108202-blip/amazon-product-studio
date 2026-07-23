import { getPublicStorageUrl, readStoredFile } from "@/lib/storage";

export const REQUIRED_PLAN_COUNT = 5;
export const MAX_ZIP_IMAGE_COUNT = 5;
export const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;

const ZIP_PLAN_NAMES = {
  1: "hero",
  2: "structure",
  3: "function",
  4: "scenario",
  5: "detail",
};

export function generatedCandidateToResponse(image, { candidateNumber, preferredGeneratedImageId } = {}) {
  const run = image?.generationRun || null;
  return {
    id: image.id,
    imagePlanId: image.imagePlanId,
    generationRunId: image.generationRunId,
    outputIndex: image.outputIndex || 0,
    candidateNumber,
    isPreferred: image.id === preferredGeneratedImageId,
    isNewVersion: Number(candidateNumber || 0) > 1,
    isForcedVersion: Boolean(run?.isForcedVersion),
    url: getPublicStorageUrl(image.storageKey),
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
    sha256: image.sha256,
    createdAt: image.createdAt,
    run: run
      ? {
          id: run.id,
          provider: run.provider || "",
          model: run.model || "",
          protocol: run.protocol || "",
          status: run.status,
          mode: run.mode,
          aspectRatio: run.aspectRatio || "",
          resolution: run.resolution || "",
          usedStaleInput: run.usedStaleInput,
          isForcedVersion: run.isForcedVersion,
          durationMs: run.durationMs,
          createdAt: run.createdAt,
          completedAt: run.completedAt,
          errorCode: run.errorCode || "",
        }
      : null,
  };
}

export function imageExtensionFromMime(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".png";
}

export function safeAsciiName(value, fallback = "download") {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function candidateDownloadFileName(image, imagePlan, candidateNumber) {
  const planIndex = String(imagePlan?.planIndex || 0).padStart(2, "0");
  const planName = safeAsciiName(imagePlan?.taskType || ZIP_PLAN_NAMES[imagePlan?.planIndex] || "image", "image");
  const candidate = String(candidateNumber || 1).padStart(2, "0");
  return `${planIndex}-${planName}-candidate-${candidate}${imageExtensionFromMime(image.mimeType)}`;
}

export function preferredZipFileName(projectName) {
  return `${safeAsciiName(projectName, "project")}-preferred-images.zip`;
}

export function preferredZipEntryName(plan, image) {
  const planIndex = Number(plan.planIndex || 0);
  const prefix = String(planIndex).padStart(2, "0");
  const label = ZIP_PLAN_NAMES[planIndex] || safeAsciiName(plan.taskType, "image");
  return `${prefix}-${label}${imageExtensionFromMime(image.mimeType)}`;
}

export async function loadPreferredZipEntries(project) {
  const orderedPlans = [...(project.imagePlans || [])].sort((a, b) => a.planIndex - b.planIndex);
  const missing = orderedPlans
    .filter((plan) => !plan.preferredGeneratedImage || plan.preferredGeneratedImage.deletedAt)
    .map((plan) => ({
      planId: plan.id,
      planIndex: plan.planIndex,
      taskType: plan.taskType,
      label: `图${plan.planIndex} ${plan.taskType}`,
    }));

  if (orderedPlans.length !== REQUIRED_PLAN_COUNT || missing.length) {
    return {
      ok: false,
      code: "PREFERRED_SET_INCOMPLETE",
      missing,
      entries: [],
    };
  }

  const entries = [];
  let totalBytes = 0;
  for (const plan of orderedPlans) {
    const image = plan.preferredGeneratedImage;
    let file;
    try {
      file = await readStoredFile(image.storageKey);
    } catch {
      return {
        ok: false,
        code: "PREFERRED_FILE_MISSING",
        missing: [{
          planId: plan.id,
          planIndex: plan.planIndex,
          taskType: plan.taskType,
          label: `图${plan.planIndex} ${plan.taskType}`,
        }],
        entries: [],
      };
    }

    totalBytes += file.buffer.length;
    if (entries.length >= MAX_ZIP_IMAGE_COUNT || totalBytes > MAX_ZIP_TOTAL_BYTES) {
      return {
        ok: false,
        code: "ZIP_EXPORT_FAILED",
        missing: [],
        entries: [],
      };
    }

    entries.push({
      name: preferredZipEntryName(plan, image),
      data: file.buffer,
      mtime: image.createdAt || new Date(),
    });
  }

  return { ok: true, code: "", missing: [], entries };
}

export function buildStoredZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const safeName = safeZipEntryName(entry.name);
    const name = Buffer.from(safeName, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const { time, date } = msDosDateTime(entry.mtime || new Date());

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    locals.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...central, end]);
}

function safeZipEntryName(name) {
  const safe = safeAsciiName(name, "image.png");
  if (safe.includes("/") || safe.includes("\\") || safe.includes("..")) {
    throw new Error("Unsafe zip entry name");
  }
  return safe;
}

const CRC_TABLE = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function msDosDateTime(value) {
  const date = new Date(value);
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}
