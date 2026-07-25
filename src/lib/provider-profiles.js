import { hasCredentialKey, maskApiKey } from "./security.js";

export const PROVIDERS = [
  "openai",
  "gemini",
  "deepseek",
  "doubao",
  "openai-compatible",
];

export const CAPABILITIES = ["text", "reasoning", "vision", "image", "asyncImage"];

export const IMAGE_GENERATION_PROTOCOLS = [
  "openai-images",
  "openai-image-edit",
  "gemini-native-image",
  "doubao-image",
  "generic-async-image",
];

export function inferModelCapabilities(provider, modelId = "") {
  const model = String(modelId || "").toLowerCase();
  // P1-9: Conservative inference — start empty, add only with evidence
  const capabilities = new Set();

  // Text: most generative models support text, but embedding/audio/image-only do not
  const isNonTextModel = /(embedding|aqa|whisper|tts|davinci|babbage|dall-e|gpt-image|imagen|seedream|kolors|flux|stable-diffusion|sdxl)/.test(model);
  if (!isNonTextModel) {
    capabilities.add("text");
  }

  // Vision: only when model name clearly indicates visual capability
  if (provider === "gemini") {
    if (/(vision|flash|pro|ultra)/.test(model) && !/(embedding|aqa|text-)/.test(model)) {
      capabilities.add("vision");
    }
  } else if (provider === "openai" || provider === "openai-compatible") {
    if (/\b(gpt-4o|o3|o4|vision|vl|visual|multimodal|omni|pixtral)\b/.test(model)) {
      capabilities.add("vision");
    }
  }

  // Image generation
  if (/(gpt-image|dall-e|imagen|nano-banana|seedream|kolors|flux|stable-diffusion|sdxl)/.test(model)) {
    capabilities.add("image");
  }

  // Async image
  if (/(async|task|seedream|doubao|volc|ark)/.test(model) || provider === "doubao") {
    capabilities.add("asyncImage");
  }

  // Reasoning: only specific models
  if (provider === "openai" && /\b(o1|o3|o4)\b/.test(model)) {
    capabilities.add("reasoning");
  } else if (provider === "deepseek") {
    capabilities.add("reasoning");
  }

  if (provider === "deepseek") {
    capabilities.delete("vision");
    capabilities.delete("image");
    capabilities.delete("asyncImage");
  }

  return [...capabilities].filter((capability) => CAPABILITIES.includes(capability));
}

export function inferProviderProtocol(provider, modelId = "", capabilities = []) {
  const model = String(modelId || "").toLowerCase();
  if (provider === "gemini" && capabilities.includes("image")) return "gemini-native-image";
  if (provider === "openai" && capabilities.includes("image")) {
    if (/gpt-image/.test(model)) return "openai-images";
    return "openai-image-edit";
  }
  if (provider === "openai-compatible" && capabilities.includes("image")) {
    if (/gpt-image/.test(model)) return "openai-images";
    return "openai-image-edit";
  }
  if (provider === "doubao" || capabilities.includes("asyncImage") || /(seedream|doubao|volc|ark)/.test(model)) {
    return "doubao-image";
  }
  return getProviderDefaults(provider).protocol;
}

export function inferProviderDraftSettings({ provider, modelId, protocol, capabilities } = {}) {
  const inferredCapabilities = inferModelCapabilities(provider, modelId);
  const nextCapabilities =
    inferredCapabilities.length > 0
      ? inferredCapabilities
      : Array.isArray(capabilities) && capabilities.length > 0
        ? capabilities
        : getProviderDefaults(provider).capabilities;
  const inferredProtocol = inferProviderProtocol(provider, modelId, nextCapabilities);
  const model = String(modelId || "").toLowerCase();
  const preferReferenceImageProtocol =
    (provider === "openai" || provider === "openai-compatible") &&
    /gpt-image/.test(model) &&
    nextCapabilities.includes("image");
  return {
    capabilities: nextCapabilities,
    protocol: preferReferenceImageProtocol ? "openai-image-edit" : (inferredProtocol || protocol),
  };
}

export const MODEL_ROLES = {
  product_vision: {
    label: "商品识图",
    accepts: (capabilities) => capabilities.includes("vision"),
  },
  image_planning: {
    label: "策划与提示词",
    accepts: (capabilities) => capabilities.includes("text"),
  },
  image_generation: {
    label: "图片生成",
    accepts: (capabilities, profile = {}) =>
      profile.provider !== "deepseek" &&
      (capabilities.includes("image") || capabilities.includes("asyncImage")),
  },
};

export const ACCEPTANCE_LABELS = {
  official:        { label: "官方明确支持",  cls: "text-emerald-300" },
  adapterVerified: { label: "适配器已验证",  cls: "text-emerald-400" },
  inferred:        { label: "推断支持",      cls: "text-amber-300" },
  unverified:      { label: "未验证",        cls: "text-zinc-400" },
  unsupported:     { label: "明确不支持",    cls: "text-red-400" },
};

export function roleAcceptanceLevel(role, profile) {
  if (!profile.enabled) return "unsupported";
  const capabilities = profile.capabilities || [];
  if (role === "product_vision") {
    if (!capabilities.includes("vision")) return "unsupported";
    if (profile.provider === "gemini") return "adapterVerified";
    return "inferred";
  }
  if (role === "image_planning") {
    if (!capabilities.includes("text")) return "unsupported";
    return capabilities.includes("reasoning") ? "adapterVerified" : "inferred";
  }
  if (role === "image_generation") {
    if (!capabilities.includes("image") && !capabilities.includes("asyncImage")) return "unsupported";
    if (profile.provider === "deepseek") return "unsupported";
    const refStatus = referenceImageSupportStatus(profile);
    if (refStatus === "verified") return "adapterVerified";
    if (refStatus === "text_only") return "inferred";
    return "unverified";
  }
  return "unverified";
}

export const PROVIDER_DEFAULTS = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai-images",
    capabilities: ["text", "reasoning", "vision", "image"],
  },
  gemini: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    protocol: "gemini-native-image",
    capabilities: ["text", "reasoning", "vision", "image"],
  },
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    protocol: "openai-compatible",
    capabilities: ["text", "reasoning"],
  },
  doubao: {
    name: "豆包 / 火山方舟",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    protocol: "doubao-image",
    capabilities: ["text"],
  },
  "openai-compatible": {
    name: "OpenAI Compatible",
    baseUrl: "",
    protocol: "openai-compatible",
    capabilities: ["text"],
  },
};

export function parseCapabilities(profile) {
  try {
    const parsed = JSON.parse(profile.capabilitiesJson || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((capability) => CAPABILITIES.includes(capability))
      : [];
  } catch {
    return [];
  }
}

export function supportsReferenceImagesProfile(profile = {}) {
  return protocolSupportsReferenceImages(profile.provider, profile.protocol);
}

export function referenceImageSupportStatus(profile = {}) {
  if (protocolSupportsReferenceImages(profile.provider, profile.protocol)) return "verified";
  if (profile.protocol === "openai-images") return "text_only";
  if (["doubao-image", "generic-async-image"].includes(profile.protocol)) return "unverified";
  return "unsupported";
}

export function protocolSupportsReferenceImages(provider, protocol) {
  if (provider === "gemini") return protocol === "gemini-native-image";
  if (provider === "openai") return protocol === "openai-image-edit";
  if (provider === "openai-compatible") return protocol === "openai-image-edit";
  if (provider === "doubao") return false;
  return false;
}

export function sanitizeProviderProfile(profile) {
  const capabilities = parseCapabilities(profile);
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    modelId: profile.modelId,
    protocol: profile.protocol,
    capabilities,
    supportsReferenceImages: supportsReferenceImagesProfile(profile),
    referenceImageSupportStatus: referenceImageSupportStatus(profile),
    timeoutMs: profile.timeoutMs,
    maxRetries: profile.maxRetries,
    enabled: profile.enabled,
    maskedApiKey: maskApiKey(profile.apiKeyLast4 || ""),
    hasApiKey: Boolean(profile.encryptedApiKey),
    lastTestOk: profile.lastTestOk,
    lastTestMessage: profile.lastTestMessage,
    lastTestedAt: profile.lastTestedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function sanitizeRoleAssignment(assignment) {
  return {
    id: assignment.id,
    userId: assignment.userId,
    role: assignment.role,
    providerProfileId: assignment.providerProfileId,
    modelId: assignment.modelId || null,
    isUserForced: Boolean(assignment.isUserForced),
    providerProfile: assignment.providerProfile
      ? sanitizeProviderProfile(assignment.providerProfile)
      : null,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

export function getProviderDefaults(provider) {
  return PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS["openai-compatible"];
}

export function validateProviderInput(input, { requireApiKey = false } = {}) {
  const errors = [];
  const provider = input.provider;
  const baseUrl = (input.baseUrl || "").trim();
  const modelId = (input.modelId || "").trim();
  const capabilities = Array.isArray(input.capabilities)
    ? input.capabilities.filter((capability) => CAPABILITIES.includes(capability))
    : [];
  const timeoutMs = Number(input.timeoutMs ?? 30000);
  const maxRetries = Number(input.maxRetries ?? 0);

  if (!PROVIDERS.includes(provider)) errors.push("供应商不受支持");
  if (provider === "deepseek" && (capabilities.includes("image") || capabilities.includes("asyncImage"))) {
    errors.push("DeepSeek 不支持图片生成");
  }
  if (!(input.name || "").trim()) errors.push("请填写配置名称");
  if (!modelId) errors.push("请填写 Model ID");
  if (provider !== "openai-compatible" && !baseUrl) errors.push("请填写 Base URL");
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("Base URL 必须使用 http 或 https");
      }
    } catch {
      errors.push("Base URL 格式不正确");
    }
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) {
    errors.push("超时时间必须在 1000 到 180000 毫秒之间");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    errors.push("重试次数必须在 0 到 5 之间");
  }
  if (capabilities.length === 0) errors.push("至少选择一个能力标签");
  if (
    provider === "doubao" &&
    (capabilities.includes("image") || capabilities.includes("asyncImage")) &&
    !supportsReferenceImagesProfile({ provider, protocol: (input.protocol || "").trim() })
  ) {
    errors.push("豆包图片协议暂未实现真实参考图传输，不能用于默认电商商品图生成");
  }
  if (
    (capabilities.includes("image") || capabilities.includes("asyncImage")) &&
    !IMAGE_GENERATION_PROTOCOLS.includes((input.protocol || "").trim())
  ) {
    errors.push("请选择支持的图片生成协议");
  }
  if (requireApiKey && !input.apiKey) errors.push("请填写 API Key");
  if ((input.apiKey || "").trim() && !hasCredentialKey()) {
    errors.push("缺少 CREDENTIAL_ENCRYPTION_KEY，无法安全保存 API Key");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      name: (input.name || "").trim(),
      provider,
      baseUrl: baseUrl || null,
      modelId,
      protocol: (input.protocol || getProviderDefaults(provider).protocol).trim(),
      capabilities,
      timeoutMs,
      maxRetries,
      enabled: input.enabled !== false,
      apiKey: (input.apiKey || "").trim(),
    },
  };
}

export function validateProviderDraftInput(input, { requireApiKey = true } = {}) {
  const errors = [];
  const provider = input.provider;
  const baseUrl = (input.baseUrl || "").trim();
  const protocol = (input.protocol || getProviderDefaults(provider).protocol).trim();
  const capabilities = Array.isArray(input.capabilities)
    ? input.capabilities.filter((capability) => CAPABILITIES.includes(capability))
    : getProviderDefaults(provider).capabilities;
  const timeoutMs = Number(input.timeoutMs ?? 30000);
  const maxRetries = Number(input.maxRetries ?? 0);

  if (!PROVIDERS.includes(provider)) errors.push("服务商不受支持");
  if (provider !== "openai-compatible" && !baseUrl) errors.push("请填写 Base URL");
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("Base URL 必须使用 http 或 https");
      }
    } catch {
      errors.push("Base URL 格式不正确");
    }
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) {
    errors.push("超时时间必须在 1000 到 180000 毫秒之间");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    errors.push("重试次数必须在 0 到 5 之间");
  }
  if (requireApiKey && !(input.apiKey || "").trim()) errors.push("请填写 API Key");

  return {
    ok: errors.length === 0,
    errors,
    value: {
      id: "draft-provider",
      name: (input.name || getProviderDefaults(provider).name || "Draft Provider").trim(),
      provider,
      baseUrl: baseUrl || null,
      apiKey: (input.apiKey || "").trim(),
      modelId: (input.modelId || "").trim(),
      protocol,
      capabilities,
      timeoutMs,
      maxRetries,
      enabled: true,
    },
  };
}
