import crypto from "crypto";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import {
  parseCapabilities,
  supportsReferenceImagesProfile,
} from "@/lib/provider-profiles";
import { parseStoredArray } from "@/lib/product-identity";
import {
  deleteStoredFile,
  downloadImageToBuffer,
  getPublicStorageUrl,
  saveGeneratedImage,
} from "@/lib/storage";
import { ProviderError, normalizeProviderError } from "@/lib/providers/errors";

export const IMAGE_GENERATION_PROTOCOLS = [
  "openai-images",
  "openai-image-edit",
  "gemini-native-image",
  "doubao-image",
  "generic-async-image",
];

export const IMAGE_GENERATION_RESOLUTIONS = ["1K", "2K"];
export const MAX_GENERATION_REFERENCES = 4;
export const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;
export const MAX_REFERENCE_TOTAL_BYTES = 32 * 1024 * 1024;
export const ASYNC_GENERATION_EXPIRES_MS = 30 * 60 * 1000;
export const MAX_ASYNC_CHECK_ATTEMPTS = 60;
export const TERMINAL_ASYNC_ERROR_CODES = new Set([
  "INVALID_API_KEY",
  "MODEL_NOT_FOUND",
  "INSUFFICIENT_QUOTA",
  "ASYNC_TASK_FAILED",
  "ASYNC_TASK_EXPIRED",
  "INVALID_IMAGE_RESPONSE",
]);

const REFERENCE_PRIORITY = {
  front: 1,
  side: 2,
  detail: 3,
  back: 4,
  inside: 5,
  packaging: 6,
  scene: 7,
  other: 8,
};

export function supportsImageGenerationProfile(profile) {
  if (!profile?.enabled) return false;
  if (profile.provider === "deepseek") return false;
  const capabilities = parseCapabilities(profile);
  return capabilities.includes("image") || capabilities.includes("asyncImage");
}

export function validateImageGenerationProtocol(profile) {
  if (profile.provider === "gemini" && profile.protocol !== "gemini-native-image") {
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "Gemini 图片生成必须使用 gemini-native-image");
  }
  if (profile.provider === "openai" && !["openai-images", "openai-image-edit"].includes(profile.protocol)) {
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "当前 OpenAI 图片生成协议不受支持");
  }
  if (profile.provider === "doubao" && profile.protocol !== "doubao-image") {
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "豆包图片生成必须使用 doubao-image");
  }
  if (
    profile.provider === "openai-compatible" &&
    !["openai-images", "openai-image-edit", "generic-async-image"].includes(profile.protocol)
  ) {
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "当前 OpenAI 兼容图片协议不受支持");
  }
  if (profile.provider === "deepseek") {
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "DeepSeek 不支持图片生成");
  }
  if (!supportsReferenceImagesProfile(profile)) {
    throw new ProviderError(
      "REFERENCE_IMAGES_UNSUPPORTED",
      "当前图片生成协议不会真实传递参考图",
    );
  }
}

export function getAsyncGenerationExpiresAt(now = new Date()) {
  return new Date(now.getTime() + ASYNC_GENERATION_EXPIRES_MS);
}

export function buildPromptSnapshot({ project, productIdentity, imagePlan, referenceImages, output }) {
  const mustKeep = parseStoredArray(productIdentity.mustKeepJson);
  const avoidChanges = parseStoredArray(productIdentity.avoidChangesJson);
  const roleSummary = referenceImages
    .map((image, index) => `${index + 1}. ${image.imageRole}${image.isPrimary ? "，主参考图" : ""}`)
    .join("; ");

  return [
    imagePlan.finalPrompt,
    "",
    "产品一致性约束：",
    `产品身份：${productIdentity.productName || project.productName || project.name}`,
    `必须保持：${mustKeep.join("; ") || "已确认的商品形状、颜色、Logo、结构和真实部件"}`,
    `禁止改变：${avoidChanges.join("; ") || "不得改变已验证的商品属性"}`,
    `本次生成使用的参考图：${roleSummary}`,
    `输出要求：${output.aspectRatio || project.aspectRatio || "1:1"}，${output.resolution || "1K"}，一张电商商品图。`,
    "必须使用参考图保持真实商品一致性。不要生成拼图、九宫格、额外配件或不同商品。所有自然语言提示默认使用简体中文。",
  ].join("\n");
}

export function calculateGenerationFingerprint({
  project,
  productIdentity,
  imagePlan,
  referenceImages,
  providerProfile,
  output,
}) {
  const payload = {
    projectId: project.id,
    identityUpdatedAt: productIdentity.updatedAt?.toISOString?.() || "",
    identityIsStale: productIdentity.isStale,
    imagePlanId: imagePlan.id,
    imagePlanUpdatedAt: imagePlan.updatedAt?.toISOString?.() || "",
    imagePlanIsStale: imagePlan.isStale,
    finalPrompt: imagePlan.finalPrompt || "",
    references: referenceImages.map((image) => ({
      id: image.id,
      storageKey: image.storageKey || "",
      fileName: image.fileName || "",
      mimeType: image.mimeType || "",
      role: image.imageRole || "",
      isPrimary: image.isPrimary,
      includeInGeneration: image.includeInGeneration,
      createdAt: image.createdAt?.toISOString?.() || "",
    })),
    providerProfileId: providerProfile.id,
    provider: providerProfile.provider,
    modelId: providerProfile.modelId,
    protocol: providerProfile.protocol,
    aspectRatio: output.aspectRatio,
    resolution: output.resolution,
    count: output.count,
  };

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function pickDefaultGenerationReferences(referenceImages = []) {
  const primary = referenceImages.find((image) => image.isPrimary);
  if (!primary) return [];

  const selected = referenceImages
    .filter((image) => image.id !== primary.id && image.includeInGeneration)
    .sort((a, b) => {
      const roleA = REFERENCE_PRIORITY[a.imageRole] || 99;
      const roleB = REFERENCE_PRIORITY[b.imageRole] || 99;
      if (roleA !== roleB) return roleA - roleB;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

  return [primary, ...selected].slice(0, MAX_GENERATION_REFERENCES);
}

export async function loadGenerationReferences(referenceImages) {
  if (!referenceImages.some((image) => image.isPrimary)) {
    throw new ProviderError("MISSING_PRIMARY_REFERENCE", "缺少主参考图");
  }
  if (referenceImages.length > MAX_GENERATION_REFERENCES) {
    throw new ProviderError("TOO_MANY_REFERENCE_IMAGES", "参与生成的参考图最多 4 张");
  }

  let totalBytes = 0;
  const output = [];
  for (const image of referenceImages) {
    if (!image.localPath) {
      throw new ProviderError("REFERENCE_FILE_NOT_FOUND", "参考图文件不存在");
    }
    const stat = await fs.stat(image.localPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new ProviderError("REFERENCE_FILE_NOT_FOUND", "参考图文件不存在");
    }
    if (stat.size > MAX_REFERENCE_BYTES) {
      throw new ProviderError("INVALID_REFERENCE_IMAGE", "参考图超过 12MB");
    }
    totalBytes += stat.size;
    if (totalBytes > MAX_REFERENCE_TOTAL_BYTES) {
      throw new ProviderError("INVALID_REFERENCE_IMAGE", "参考图总大小过大");
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(image.mimeType)) {
      throw new ProviderError("INVALID_REFERENCE_IMAGE", "参考图格式不支持");
    }

    output.push({
      id: image.id,
      mimeType: image.mimeType,
      data: await fs.readFile(image.localPath),
      role: image.imageRole,
      isPrimary: image.isPrimary,
      storageKey: image.storageKey,
    });
  }

  return output;
}

export function imageGenerationRunToResponse(run) {
  if (!run) return null;
  const images = run.generatedImages || [];
  return {
    id: run.id,
    projectId: run.projectId,
    imagePlanId: run.imagePlanId,
    providerProfileId: run.providerProfileId || "",
    provider: run.provider || "",
    model: run.model || "",
    protocol: run.protocol || "",
    status: run.status,
    mode: run.mode,
    externalTaskId: run.externalTaskId || "",
    inputFingerprint: run.inputFingerprint || "",
    aspectRatio: run.aspectRatio || "",
    resolution: run.resolution || "",
    requestedCount: run.requestedCount,
    usedStaleInput: run.usedStaleInput,
    isForcedVersion: run.isForcedVersion,
    checkAttempts: run.checkAttempts || 0,
    lastCheckedAt: run.lastCheckedAt || null,
    expiresAt: run.expiresAt || null,
    errorCode: run.errorCode || "",
    errorMessage: run.errorMessage || "",
    durationMs: run.durationMs,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    generatedImages: images.filter((image) => !image.deletedAt).map(generatedImageToResponse),
  };
}

export function generatedImageToResponse(image) {
  if (!image) return null;
  return {
    id: image.id,
    projectId: image.projectId,
    imagePlanId: image.imagePlanId,
    generationRunId: image.generationRunId,
    outputIndex: image.outputIndex || 0,
    url: getPublicStorageUrl(image.storageKey),
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
    sha256: image.sha256,
    sourceType: image.sourceType,
    createdAt: image.createdAt,
  };
}

export async function persistGeneratedImages({ projectId, imagePlanId, generationRunId, images }) {
  const requested = images.slice(0, 1);
  if (!requested.length) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Provider returned no image");
  }

  const saved = [];
  for (const [outputIndex, image] of requested.entries()) {
    const existing = await prisma.generatedImage.findUnique({
      where: { generationRunId_outputIndex: { generationRunId, outputIndex } },
    });
    if (existing) {
      saved.push(existing);
      continue;
    }

    const buffer = await imageSourceToBuffer(image);
    const rowId = crypto.randomUUID();
    const stored = await saveGeneratedImage(projectId, generationRunId, rowId, buffer, image.url ? "remote_url" : "base64");
    try {
      const row = await prisma.generatedImage.create({
        data: {
          id: rowId,
          projectId,
          imagePlanId,
          generationRunId,
          outputIndex,
          storageKey: stored.storageKey,
          localPath: stored.localPath,
          mimeType: stored.mimeType,
          width: stored.width,
          height: stored.height,
          byteSize: stored.byteSize,
          sha256: stored.sha256,
          sourceType: stored.sourceType,
        },
      });
      saved.push(row);
    } catch (error) {
      await deleteStoredFile(stored.storageKey, stored.localPath).catch(() => {});
      if (error?.code === "P2002") {
        const row = await prisma.generatedImage.findUnique({
          where: { generationRunId_outputIndex: { generationRunId, outputIndex } },
        });
        if (row) {
          saved.push(row);
          continue;
        }
      }
      throw error;
    }
  }

  if (!saved.length) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Provider returned no image");
  }

  return saved;
}

export async function imageSourceToBuffer(image) {
  if (image?.data) {
    return Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data, "base64");
  }
  if (image?.url) {
    return downloadImageToBuffer(image.url);
  }
  throw new ProviderError("INVALID_IMAGE_RESPONSE", "Provider returned no image data");
}

export function normalizedGenerationError(error) {
  const normalized = normalizeProviderError(error);
  return {
    code: normalized.code || "UPSTREAM_ERROR",
    message: normalized.message || "Image generation failed",
    httpStatus: normalized.httpStatus || 0,
  };
}
