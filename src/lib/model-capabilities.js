const VALID_CAPABILITIES = new Set(["text", "reasoning", "vision", "image", "asyncImage"]);

const REFERENCE_PROTOCOLS = new Set(["gemini-native-image", "openai-image-edit"]);

const NON_TEXT_PATTERN = /(embedding|aqa|whisper|tts|davinci|babbage|dall-e|gpt-image|imagen|seedream|kolors|flux|stable-diffusion|sdxl)/;

const MODEL_CATALOG = {
  "gemini-3.1-flash-image": {
    displayName: "Nano Banana 2",
    badges: ["热门首选"],
    rank: 100,
    lifecycle: "stable",
    capabilities: ["text", "vision", "image"],
    protocol: "gemini-native-image",
    supportsReferenceImages: true,
    recommendedFor: ["image_generation", "reference_image_editing"],
    aliases: ["nano banana 2", "nano banana", "香蕉", "banana"],
    reason: "综合质量、速度、成本和多参考图一致性最均衡",
  },
  "gemini-3.1-flash-lite-image": {
    displayName: "Nano Banana 2 Lite",
    badges: ["极速省钱"],
    rank: 80,
    lifecycle: "stable",
    capabilities: ["text", "vision", "image"],
    protocol: "gemini-native-image",
    supportsReferenceImages: true,
    recommendedFor: ["image_generation", "reference_image_editing"],
    aliases: ["nano banana 2 lite", "nano banana lite", "香蕉 lite", "banana lite"],
    reason: "低延迟、低成本、高频批量任务",
  },
  "gemini-3-pro-image": {
    displayName: "Nano Banana Pro",
    badges: ["专业旗舰"],
    rank: 90,
    lifecycle: "stable",
    capabilities: ["text", "vision", "image"],
    protocol: "gemini-native-image",
    supportsReferenceImages: true,
    recommendedFor: ["image_generation", "reference_image_editing"],
    aliases: ["nano banana pro", "香蕉 pro", "banana pro"],
    reason: "复杂构图、品牌一致性、文字准确性和高分辨率专业素材",
  },
  "gemini-2.5-flash-image": {
    displayName: "Nano Banana",
    badges: ["旧版"],
    rank: 20,
    lifecycle: "deprecated",
    capabilities: ["text", "vision", "image"],
    protocol: "gemini-native-image",
    supportsReferenceImages: true,
    recommendedFor: ["image_generation", "reference_image_editing"],
    aliases: ["nano banana", "香蕉", "banana"],
    reason: "仍可使用，但不再作为默认推荐",
  },
  "gemini-2.5-flash": {
    displayName: "Gemini 2.5 Flash",
    badges: ["稳定兼容"],
    rank: 55,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "gemini",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gemini flash", "gemini 2.5 flash"],
    reason: "支持图片输入和文字输出，可用于商品识别",
  },
  "gemini-2.5-flash-lite": {
    displayName: "Gemini 2.5 Flash Lite",
    badges: ["极速省钱"],
    rank: 50,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "gemini",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gemini flash lite", "gemini 2.5 flash lite"],
    reason: "支持图片输入和文字输出，适合低成本识图",
  },
  "gemini-2.5-pro": {
    displayName: "Gemini 2.5 Pro",
    badges: ["专业旗舰"],
    rank: 60,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "gemini",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gemini pro", "gemini 2.5 pro"],
    reason: "支持图片输入和文字输出，可用于高质量商品识别",
  },
  "gpt-4.1": {
    displayName: "GPT-4.1",
    badges: ["专业旗舰"],
    rank: 60,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "openai-compatible",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gpt 4.1"],
    reason: "支持图片输入和文字输出，不是图片生成模型",
  },
  "gpt-4.1-mini": {
    displayName: "GPT-4.1 mini",
    badges: ["热门首选"],
    rank: 55,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "openai-compatible",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gpt 4.1 mini"],
    reason: "支持图片输入和文字输出，不是图片生成模型",
  },
  "gpt-4.1-nano": {
    displayName: "GPT-4.1 nano",
    badges: ["极速省钱"],
    rank: 45,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "openai-compatible",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gpt 4.1 nano"],
    reason: "支持图片输入和文字输出，不是图片生成模型",
  },
  "gpt-4o": {
    displayName: "GPT-4o",
    badges: ["热门首选"],
    rank: 58,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "openai-compatible",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gpt 4o", "omni"],
    reason: "支持图片输入和文字输出，不是图片生成模型",
  },
  "gpt-4o-mini": {
    displayName: "GPT-4o mini",
    badges: ["极速省钱"],
    rank: 48,
    lifecycle: "stable",
    capabilities: ["text", "vision"],
    protocol: "openai-compatible",
    supportsReferenceImages: false,
    recommendedFor: ["product_vision", "image_planning"],
    aliases: ["gpt 4o mini"],
    reason: "支持图片输入和文字输出，不是图片生成模型",
  },
  "gpt-image-1": {
    displayName: "GPT Image 1",
    badges: ["热门首选"],
    rank: 75,
    lifecycle: "stable",
    capabilities: ["image"],
    protocol: "openai-image-edit",
    supportsReferenceImages: true,
    recommendedFor: ["image_generation", "reference_image_editing"],
    aliases: ["gpt image"],
    reason: "图片生成/编辑模型，支持参考图编辑协议",
  },
  "gpt-image-2": {
    displayName: "GPT Image 2",
    badges: ["热门首选"],
    rank: 85,
    lifecycle: "stable",
    capabilities: ["image"],
    protocol: "openai-image-edit",
    supportsReferenceImages: true,
    recommendedFor: ["image_generation", "reference_image_editing"],
    aliases: ["gpt image 2"],
    reason: "图片生成/编辑模型，支持参考图编辑协议",
  },
  "text-embedding-3-small": {
    displayName: "text-embedding-3-small",
    badges: [],
    rank: 0,
    lifecycle: "stable",
    capabilities: [],
    protocol: "openai-compatible",
    supportsReferenceImages: false,
    recommendedFor: [],
    aliases: [],
    reason: "Embedding 模型不能用于商品识别或图片生成",
    unsupported: true,
  },
  "tts-1": {
    displayName: "tts-1",
    badges: [],
    rank: 0,
    lifecycle: "stable",
    capabilities: [],
    protocol: "openai-compatible",
    supportsReferenceImages: false,
    recommendedFor: [],
    aliases: [],
    reason: "语音模型不能用于商品识别或图片生成",
    unsupported: true,
  },
};

export function normalizeModelId(modelId = "") {
  return String(modelId || "")
    .trim()
    .replace(/^models\//i, "")
    .toLowerCase();
}

export function splitModelLifecycle(modelId = "") {
  const normalized = normalizeModelId(modelId);
  if (/-preview$/.test(normalized)) return { baseModelId: normalized.replace(/-preview$/, ""), lifecycle: "preview" };
  if (/-stable$/.test(normalized)) return { baseModelId: normalized.replace(/-stable$/, ""), lifecycle: "stable" };
  if (/-latest$/.test(normalized)) return { baseModelId: normalized.replace(/-latest$/, ""), lifecycle: "stable" };
  return { baseModelId: normalized, lifecycle: null };
}

export function getModelCatalogEntry(modelId = "") {
  const normalized = normalizeModelId(modelId);
  const split = splitModelLifecycle(modelId);
  return MODEL_CATALOG[normalized] || MODEL_CATALOG[split.baseModelId] || null;
}

export function protocolSupportsReferenceImages(provider, protocol) {
  if (provider === "deepseek") return false;
  return REFERENCE_PROTOCOLS.has(protocol);
}

function uniqueCapabilities(capabilities = []) {
  return [...new Set(capabilities)].filter((capability) => VALID_CAPABILITIES.has(capability));
}

function inferCapabilitiesFromModelFamily(provider, modelId, metadata = {}) {
  const model = normalizeModelId(modelId);
  const methods = Array.isArray(metadata.supportedGenerationMethods) ? metadata.supportedGenerationMethods : [];
  const capabilities = new Set();

  if (!NON_TEXT_PATTERN.test(model)) capabilities.add("text");

  if (provider === "gemini") {
    if (methods.includes("generateContent")) capabilities.add("text");
    if (/^gemini-/.test(model) && /(flash|pro|ultra)/.test(model) && !/(embedding|aqa|text-)/.test(model)) {
      capabilities.add("vision");
    }
    if (/(imagen|image|nano-banana)/.test(model)) capabilities.add("image");
  } else if (provider === "openai" || provider === "openai-compatible") {
    if (/\b(gpt-4\.1|gpt-4o|o3|o4|vision|vl|visual|multimodal|omni|pixtral)\b/.test(model)) {
      capabilities.add("vision");
    }
    if (/(gpt-image|dall-e)/.test(model)) {
      capabilities.add("image");
      capabilities.delete("text");
      capabilities.delete("vision");
    }
    if (/\b(o1|o3|o4)\b/.test(model)) capabilities.add("reasoning");
  } else if (provider === "deepseek") {
    capabilities.add("text");
    capabilities.add("reasoning");
    capabilities.delete("vision");
    capabilities.delete("image");
    capabilities.delete("asyncImage");
  }

  if (/(async|task|seedream|doubao|volc|ark)/.test(model) || provider === "doubao") {
    capabilities.add("asyncImage");
  }

  if (NON_TEXT_PATTERN.test(model) && !/(gpt-image|dall-e|imagen|seedream|kolors|flux|stable-diffusion|sdxl)/.test(model)) {
    capabilities.delete("text");
  }

  return uniqueCapabilities([...capabilities]);
}

function inferProtocol(provider, modelId, capabilities) {
  const model = normalizeModelId(modelId);
  if (provider === "gemini" && capabilities.includes("image")) return "gemini-native-image";
  if ((provider === "openai" || provider === "openai-compatible") && capabilities.includes("image")) {
    return /gpt-image/.test(model) ? "openai-image-edit" : "openai-images";
  }
  if (provider === "doubao" || capabilities.includes("asyncImage") || /(seedream|doubao|volc|ark)/.test(model)) {
    return "doubao-image";
  }
  if (provider === "gemini") return "gemini";
  return "openai-compatible";
}

function resolveStatus(provider, catalogEntry, capabilities, adapterProbe) {
  if (adapterProbe?.capabilityStatus) return adapterProbe.capabilityStatus;
  if (catalogEntry?.unsupported) return "unsupported";
  if (catalogEntry && (provider === "gemini" || provider === "openai")) return "official";
  if (catalogEntry && provider === "openai-compatible") return "unverified";
  if (capabilities.length > 0) return "inferred";
  return "unsupported";
}

function resolveReason(provider, catalogEntry, capabilityStatus, capabilities) {
  if (catalogEntry?.reason) {
    if (provider === "openai-compatible" && catalogEntry.capabilities?.includes("vision")) {
      return "官方模型支持视觉，当前兼容接口未验证";
    }
    return catalogEntry.reason;
  }
  if (capabilityStatus === "unsupported") return "模型类型明确不支持当前角色";
  if (capabilities.includes("vision")) return "根据官方模型族或接口元数据识别为支持图片输入";
  if (capabilities.includes("image") || capabilities.includes("asyncImage")) return "根据模型族识别为图片生成模型";
  return "视觉能力未验证";
}

export function resolveEffectiveModelCapability({
  provider = "",
  modelId = "",
  discoveredModel = null,
  profile = null,
  adapterProbe = null,
} = {}) {
  const rawModelId = String(modelId || discoveredModel?.modelId || profile?.modelId || "").trim();
  const normalizedModelId = normalizeModelId(rawModelId);
  const split = splitModelLifecycle(rawModelId);
  const catalogEntry = getModelCatalogEntry(rawModelId);
  const metadata = discoveredModel?.metadata || {};

  let capabilities = catalogEntry
    ? catalogEntry.capabilities
    : inferCapabilitiesFromModelFamily(provider || profile?.provider || "", rawModelId, metadata);

  if (Array.isArray(adapterProbe?.capabilities) && adapterProbe.capabilities.length) {
    capabilities = catalogEntry?.unsupported
      ? capabilities
      : uniqueCapabilities([...capabilities, ...adapterProbe.capabilities]);
  }

  capabilities = uniqueCapabilities(capabilities);
  const resolvedProvider = provider || profile?.provider || "";
  const protocol = adapterProbe?.protocol
    || discoveredModel?.protocol
    || catalogEntry?.protocol
    || inferProtocol(resolvedProvider, rawModelId, capabilities)
    || profile?.protocol
    || "";
  const lifecycle = split.lifecycle || catalogEntry?.lifecycle || "stable";
  const capabilityStatus = resolveStatus(resolvedProvider, catalogEntry, capabilities, adapterProbe);
  const supportsReferenceImages = typeof adapterProbe?.supportsReferenceImages === "boolean"
    ? adapterProbe.supportsReferenceImages
    : typeof catalogEntry?.supportsReferenceImages === "boolean"
      ? catalogEntry.supportsReferenceImages
      : protocolSupportsReferenceImages(resolvedProvider, protocol);

  return {
    modelId: normalizedModelId || rawModelId,
    rawModelId,
    provider: resolvedProvider,
    capabilities,
    protocol,
    supportsReferenceImages,
    capabilityStatus,
    reason: resolveReason(resolvedProvider, catalogEntry, capabilityStatus, capabilities),
    displayName: catalogEntry?.displayName || metadata.displayName || rawModelId,
    badges: catalogEntry?.badges || [],
    rank: catalogEntry?.rank || 10,
    recommendedFor: catalogEntry?.recommendedFor || [],
    lifecycle,
    deprecationDate: catalogEntry?.deprecationDate || null,
    aliases: catalogEntry?.aliases || [],
    metadata,
  };
}

export function modelSupportsRole(role, model) {
  const capabilities = model?.capabilities || [];
  if (model?.enabled === false) return false;
  if (model?.capabilityStatus === "unsupported") return false;
  if (role === "product_vision") return capabilities.includes("vision");
  if (role === "image_planning") return capabilities.includes("text");
  if (role === "image_generation") {
    return model?.provider !== "deepseek"
      && (capabilities.includes("image") || capabilities.includes("asyncImage"))
      && model?.supportsReferenceImages !== false;
  }
  return false;
}

function lifecyclePenalty(model) {
  if (model.lifecycle === "shutdown") return -500;
  if (model.lifecycle === "deprecated") return -200;
  if (model.lifecycle === "preview") return -80;
  return 0;
}

export function scoreModelForRole(role, model) {
  if (model?.enabled === false) return -1000;
  let score = Number(model.rank || 0) + lifecyclePenalty(model);
  if (model.recommendedFor?.includes(role)) score += 100;
  if (model.badges?.includes("热门首选")) score += 40;
  if (model.badges?.includes("专业旗舰")) score += 30;
  if (model.badges?.includes("极速省钱")) score += 20;
  if (model.capabilityStatus === "official" || model.capabilityStatus === "adapterVerified") score += 20;
  if (model.capabilityStatus === "unverified") score -= 20;
  if (role === "product_vision" && (model.capabilities?.includes("image") || model.capabilities?.includes("asyncImage"))) {
    score -= 60;
  }
  if (!modelSupportsRole(role, model)) score -= 500;
  return score;
}

export function sortModelsForRole(role, models, currentModelId = "") {
  const current = normalizeModelId(currentModelId);
  return [...models].sort((a, b) => {
    const aCurrent = normalizeModelId(a.modelId) === current ? 1 : 0;
    const bCurrent = normalizeModelId(b.modelId) === current ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    return scoreModelForRole(role, b) - scoreModelForRole(role, a);
  });
}

export function formatModelOptionLabel(model) {
  const id = normalizeModelId(model.modelId || model.rawModelId || "");
  const displayName = model.displayName && model.displayName !== id ? model.displayName : id;
  const parts = [displayName, id].filter(Boolean);
  if (model.badges?.length) parts.push(model.badges.join(" / "));
  if (model.lifecycle === "preview") parts.push("预览版");
  if (model.lifecycle === "shutdown" && model.deprecationDate) parts.push(`即将停用：${model.deprecationDate}`);
  return parts.join("｜");
}

export function modelSearchText(model) {
  return [
    model.modelId,
    model.rawModelId,
    model.displayName,
    ...(model.aliases || []),
    ...(model.badges || []),
    model.reason,
  ].filter(Boolean).join(" ").toLowerCase();
}
