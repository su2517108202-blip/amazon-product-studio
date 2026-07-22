import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

export const MAX_ANALYSIS_IMAGES = 8;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024;
export const SAFE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const ROLE_PRIORITY = {
  front: 1,
  back: 2,
  side: 3,
  inside: 4,
  detail: 5,
  packaging: 6,
  other: 7,
  scene: 8,
};

export const PRODUCT_ANALYSIS_PROMPT = `你是严谨的电商商品识图助手。请综合所有参考图，不只看第一张。
只描述能从图片确认的商品事实；无法确认时填写空字符串或空数组。
不要猜测品牌、尺寸、承重、成分、认证、具体材质等级或图片中看不清的信息。
区分商品事实与营销建议。必须保持内容只写真实外观和结构约束。
禁止改变重点包括颜色、材质外观、部件数量、结构、开合方式、包装形态、Logo 与文字位置（仅在确实可见时）。
输出严格 JSON，不使用 Markdown 代码块，不输出 JSON 之外的解释。
JSON 字段必须为：
productName, category, color, material, structure, visibleFunctions, sellingPoints, targetUsers, usageScenarios, mustKeep, avoidChanges, primaryReferenceDescription。`;

export function pickAnalysisImages(project) {
  const images = [...(project.referenceImages || [])];
  const primary = images.find((image) => image.isPrimary);
  if (!primary) {
    const error = new Error("请先设置主参考图");
    error.code = "MISSING_PRIMARY_IMAGE";
    throw error;
  }

  const selected = new Map();
  selected.set(primary.id, primary);
  for (const image of images.filter((item) => item.includeInAnalysis)) {
    selected.set(image.id, image);
  }

  const ordered = [...selected.values()].sort((a, b) => {
    if (a.id === primary.id) return -1;
    if (b.id === primary.id) return 1;
    const roleDiff =
      (ROLE_PRIORITY[a.imageRole] || 99) - (ROLE_PRIORITY[b.imageRole] || 99);
    if (roleDiff !== 0) return roleDiff;
    return a.sortOrder - b.sortOrder;
  });

  if (ordered.length > MAX_ANALYSIS_IMAGES) {
    const error = new Error("参与识别的图片最多 8 张");
    error.code = "TOO_MANY_ANALYSIS_IMAGES";
    throw error;
  }

  return ordered;
}

export async function buildAnalysisImages(project) {
  const selected = pickAnalysisImages(project);
  let totalBytes = 0;
  const prepared = [];

  for (const image of selected) {
    if (!SAFE_IMAGE_TYPES.has(image.mimeType)) {
      const error = new Error("图片格式不支持");
      error.code = "UNSUPPORTED_IMAGE_TYPE";
      throw error;
    }
    if (!image.localPath) {
      const error = new Error("参考图缺少本地文件");
      error.code = "MISSING_LOCAL_IMAGE";
      throw error;
    }

    const stat = await fs.stat(image.localPath);
    if (stat.size > MAX_IMAGE_BYTES) {
      const error = new Error("单张图片过大");
      error.code = "IMAGE_TOO_LARGE";
      throw error;
    }

    totalBytes += stat.size;
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      const error = new Error("参与识别的图片总大小过大");
      error.code = "IMAGE_BATCH_TOO_LARGE";
      throw error;
    }

    prepared.push({
      id: image.id,
      mimeType: image.mimeType,
      data: await fs.readFile(image.localPath),
      role: image.imageRole,
      isPrimary: image.isPrimary,
      fileName: image.fileName,
    });
  }

  return prepared;
}

export async function calculateInputFingerprint(project, images) {
  const payload = [];

  for (const image of images) {
    const stat = image.localPath
      ? await fs.stat(image.localPath)
      : { size: 0, mtimeMs: 0 };
    payload.push({
      projectId: project.id,
      id: image.id,
      fileName: image.fileName,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      role: image.imageRole,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
      includeInAnalysis: image.includeInAnalysis,
      storageKey: image.storageKey,
      ext: path.extname(image.fileName || ""),
    });
  }

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function runToResponse(run) {
  return {
    id: run.id,
    projectId: run.projectId,
    providerProfileId: run.providerProfileId || "",
    provider: run.provider || "",
    model: run.model || "",
    inputFingerprint: run.inputFingerprint || "",
    status: run.status,
    errorCode: run.errorCode || "",
    errorMessage: run.errorMessage || "",
    durationMs: run.durationMs,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}
