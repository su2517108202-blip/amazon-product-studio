import { hasCredentialKey, maskApiKey } from "@/lib/security";

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
      (capabilities.includes("image") || capabilities.includes("asyncImage")) &&
      supportsReferenceImagesProfile(profile),
  },
};

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
