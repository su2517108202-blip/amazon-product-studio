import fsSync, { promises as fs } from "fs";
import os from "os";
import path from "path";
import config from "@/lib/config";
import { normalizeModelId, resolveEffectiveModelCapability } from "@/lib/model-capabilities";

export const MODEL_UNAVAILABLE_FOR_ACCOUNT = "MODEL_UNAVAILABLE_FOR_ACCOUNT";

export const GEMINI_LEGACY_PRODUCT_VISION_MODELS = new Set([
  "gemini-2.5-flash",
]);

export const GEMINI_PRODUCT_VISION_REPLACEMENTS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

const memoryUnavailable = new Map();

function availabilityFile() {
  const base =
    process.env.LINGTU_LOCAL_CONFIG_DIR ||
    (process.env.APPDATA
      ? path.join(process.env.APPDATA, "LingtuAmazonStudio")
      : path.join(os.homedir(), ".lingtu-amazon-studio"));
  return path.join(base, "model-availability.json");
}

function cacheKey(providerProfileId, modelId) {
  return `${providerProfileId || "draft"}::${normalizeModelId(modelId)}`;
}

function canPersistAvailability() {
  return config.app.mode === "local";
}

function readAvailabilityFileSync() {
  if (!canPersistAvailability()) return {};
  try {
    const parsed = JSON.parse(fsSync.readFileSync(availabilityFile(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAvailabilityFile(records) {
  if (!canPersistAvailability()) return;
  const file = availabilityFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(records, null, 2), "utf8");
}

export function isGeminiLegacyProductVisionModel(modelId = "") {
  return GEMINI_LEGACY_PRODUCT_VISION_MODELS.has(normalizeModelId(modelId));
}

export function isGeminiAccountUnavailableMessage(message = "") {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("no longer available to new users") ||
    text.includes("model_unavailable_for_account")
  );
}

export function isGeminiAccountUnavailableError({ provider = "", httpStatus = 0, status = "", message = "" } = {}) {
  return (
    provider === "gemini" &&
    Number(httpStatus) === 404 &&
    /not_found/i.test(String(status || "")) &&
    isGeminiAccountUnavailableMessage(message)
  );
}

export async function markModelUnavailableForAccount({
  providerProfileId = "",
  provider = "",
  modelId = "",
  reason = "",
} = {}) {
  const normalized = normalizeModelId(modelId);
  if (!providerProfileId || !normalized) return;
  const record = {
    providerProfileId,
    provider,
    modelId: normalized,
    status: "unavailable_for_account",
    reason: reason || "当前账号不可用",
    lastCheckedAt: new Date().toISOString(),
  };
  memoryUnavailable.set(cacheKey(providerProfileId, normalized), record);
  const records = readAvailabilityFileSync();
  records[cacheKey(providerProfileId, normalized)] = record;
  await writeAvailabilityFile(records).catch(() => {});
}

export function getModelAvailability({ providerProfileId = "", modelId = "" } = {}) {
  const key = cacheKey(providerProfileId, modelId);
  return memoryUnavailable.get(key) || readAvailabilityFileSync()[key] || null;
}

export function applyModelAvailability(model, { providerProfileId = "" } = {}) {
  const availability = getModelAvailability({
    providerProfileId: providerProfileId || model?.providerProfileId || "",
    modelId: model?.modelId || model?.rawModelId || "",
  });
  if (availability?.status !== "unavailable_for_account") return model;
  return {
    ...model,
    capabilityStatus: "unavailable_for_account",
    unavailableForAccount: true,
    recommendedFor: [],
    rank: -100,
    reason: availability.reason || "当前账号不可用",
    availability,
  };
}

export function chooseGeminiProductVisionReplacement(models = []) {
  const normalizedModels = models
    .map((model) => applyModelAvailability(model, { providerProfileId: model.providerProfileId }))
    .filter((model) => model?.provider === "gemini" && !model.unavailableForAccount);
  for (const preferredId of GEMINI_PRODUCT_VISION_REPLACEMENTS) {
    const match = normalizedModels.find((model) => normalizeModelId(model.modelId) === preferredId);
    if (match && modelIsGeminiProductVisionReplacement(match)) return match;
  }
  return normalizedModels.find(modelIsGeminiProductVisionReplacement) || null;
}

export function buildGeminiReplacementCandidates({ provider = "gemini", rawModels = [], profile = null } = {}) {
  return rawModels
    .map((model) => {
      const modelId = typeof model === "string" ? model : model?.modelId || model?.id || model?.name || "";
      return resolveEffectiveModelCapability({
        provider,
        modelId,
        discoveredModel: typeof model === "object" ? model : { modelId },
        profile,
      });
    })
    .filter((model) => modelIsGeminiProductVisionReplacement(model));
}

function modelIsGeminiProductVisionReplacement(model) {
  const id = normalizeModelId(model?.modelId || "");
  const capabilities = model?.capabilities || [];
  if (!capabilities.includes("vision") || !capabilities.includes("text")) return false;
  if (capabilities.includes("image") || capabilities.includes("asyncImage")) return false;
  if (/(embedding|aqa|audio|tts|imagen|image|preview)/.test(id)) return false;
  return true;
}
