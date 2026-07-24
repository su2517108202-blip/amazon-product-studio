import { createBaseAdapter } from "./types";
import {
  classifyHttpError,
  normalizeProviderError,
  ProviderError,
  providerFetch,
  safeJoinUrl,
} from "./errors";
import {
  parseModelJson,
  sanitizeProductIdentity,
} from "@/lib/product-identity";
import { PRODUCT_ANALYSIS_PROMPT } from "@/lib/product-analysis";
import {
  IMAGE_PLANNING_PROMPT,
  parsePlanningJson,
  sanitizeImagePlans,
} from "@/lib/image-planning";

function geminiModelPath(modelId) {
  return modelId.startsWith("models/") ? modelId : `models/${modelId}`;
}

function readGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
}

async function classifyGeminiError(response) {
  let errorStatus = "";
  let errorMessage = "";
  try {
    const cloned = response.clone();
    const data = await cloned.json();
    const err = data?.error || data;
    errorStatus = String(err?.status || err?.code || "");
    errorMessage = String(err?.message || "");
  } catch {}

  const status = response.status;
  const lowered = `${errorStatus} ${errorMessage}`.toLowerCase();

  if (errorStatus === "INVALID_ARGUMENT" || errorStatus === "FAILED_PRECONDITION") {
    if (/image|media|multipart/i.test(lowered)) return "IMAGE_INPUT_UNSUPPORTED";
    if (/model.*not.*found/i.test(lowered)) return "MODEL_NOT_FOUND";
    return "INVALID_REQUEST";
  }
  if (errorStatus === "PERMISSION_DENIED") {
    if (/billing|计费/i.test(lowered)) return "BILLING_REQUIRED";
    if (/quota|配额|exhausted/i.test(lowered)) return "QUOTA_EXCEEDED";
    if (/model|access/i.test(lowered)) return "MODEL_ACCESS_DENIED";
    return "INVALID_API_KEY";
  }
  if (errorStatus === "UNAUTHENTICATED") return "INVALID_API_KEY";
  if (errorStatus === "NOT_FOUND") return "MODEL_NOT_FOUND";
  if (errorStatus === "RESOURCE_EXHAUSTED") return "RATE_LIMITED";
  if (errorStatus === "DEADLINE_EXCEEDED") return "PROVIDER_TIMEOUT";
  if (errorStatus === "INTERNAL" || errorStatus === "UNAVAILABLE") return "PROVIDER_NETWORK_ERROR";

  if (status === 401 || status === 403) {
    if (/billing|计费/i.test(lowered)) return "BILLING_REQUIRED";
    return "INVALID_API_KEY";
  }
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 400) {
    if (/image|media|multipart/i.test(lowered)) return "IMAGE_INPUT_UNSUPPORTED";
    return "INVALID_REQUEST";
  }
  if (status === 408) return "PROVIDER_TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PROVIDER_NETWORK_ERROR";

  return "UPSTREAM_ERROR";
}

async function throwGeminiError(response, fallbackMessage) {
  const code = await classifyGeminiError(response);
  let bodyText = "";
  try { const cloned = response.clone(); bodyText = await cloned.text(); } catch {}
  let summary = { httpStatus: response.status, errorStatus: "", errorMessage: "" };
  try {
    const parsed = JSON.parse((bodyText || "").slice(0, 2000));
    const err = parsed?.error || parsed;
    summary.errorStatus = String(err?.status || err?.code || "");
    summary.errorMessage = String(err?.message || "").slice(0, 500);
  } catch {}
  // Only attach sanitized summary — no raw body, no secrets
  const safeSummary = {
    httpStatus: summary.httpStatus,
    errorStatus: summary.errorStatus,
    errorMessage: summary.errorMessage,
  };
  throw new ProviderError(code, `${fallbackMessage}（${safeSummary.errorStatus || `HTTP ${safeSummary.httpStatus}`}）`, {
    httpStatus: response.status, cause: { summary: safeSummary },
  });
}

function readGeminiInteractionImages(data) {
  const outputImage = data?.output_image || data?.outputImage;
  if (outputImage?.data) {
    return [
      {
        data: Buffer.from(outputImage.data, "base64"),
        url: null,
        mimeType: outputImage.mime_type || outputImage.mimeType || "image/png",
      },
    ];
  }

  const candidates = [
    ...(Array.isArray(data?.output) ? data.output : []),
    ...(Array.isArray(data?.steps) ? data.steps.flatMap((step) => step.output || []) : []),
    ...(Array.isArray(data?.steps) ? data.steps.flatMap((step) => step.content || []) : []),
  ];
  return candidates
    .filter((item) => item?.type === "image" && item?.data)
    .map((item) => ({
      data: Buffer.from(item.data, "base64"),
      url: null,
      mimeType: item.mime_type || item.mimeType || "image/png",
    }));
}

function geminiHeaders(config, extra = {}) {
  return {
    "x-goog-api-key": config.apiKey,
    ...extra,
  };
}

export const geminiAdapter = {
  ...createBaseAdapter("gemini"),
  async testConnection(config) {
    const startedAt = Date.now();
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
      }

      const suffix = geminiModelPath(config.modelId);
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "GET",
        timeoutMs: config.timeoutMs,
        headers: geminiHeaders(config),
      });

      if (!response.ok) {
        await throwGeminiError(response, "服务商连接测试失败");
      }

      return {
        ok: true,
        provider: config.provider,
        modelId: config.modelId,
        latencyMs: Date.now() - startedAt,
        message: "连接成功",
      };
    } catch (error) {
      return normalizeProviderError(error);
    }
  },
  async listModels(config) {
    const startedAt = Date.now();
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
      }

      const response = await providerFetch(safeJoinUrl(config.baseUrl, "models"), {
        method: "GET",
        timeoutMs: config.timeoutMs,
        headers: geminiHeaders(config),
      });

      if (!response.ok) {
        await throwGeminiError(response, "无法读取模型列表");
      }

      const data = await response.json();
      const models = Array.isArray(data.models)
        ? data.models.map((item) => item.name).filter(Boolean)
        : [];

      return {
        ok: true,
        provider: config.provider,
        latencyMs: Date.now() - startedAt,
        models,
        message: models.length ? "模型列表已读取" : "服务商未返回模型列表",
      };
    } catch (error) {
      return normalizeProviderError(error);
    }
  },
  async analyzeProduct(config, input) {
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
      }
      if (!config.capabilities?.includes("vision")) {
        throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未勾选 vision 能力");
      }

      const parts = [
        {
          text: `${PRODUCT_ANALYSIS_PROMPT}\n\n项目：${input.project.name || ""}\n商品提示：${input.project.productName || ""}`,
        },
        {
          text: `参考图顺序和角色：${input.images
            .map((image, index) => `${index + 1}. ${image.role}${image.isPrimary ? " 主参考图" : ""}`)
            .join("; ")}`,
        },
        ...input.images.map((image) => ({
          inlineData: {
            mimeType: image.mimeType,
            data: image.data.toString("base64"),
          },
        })),
      ];

      const suffix = `${geminiModelPath(config.modelId)}:generateContent`;
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: geminiHeaders(config, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        await throwGeminiError(response, "商品识别请求失败");
      }

      const text = readGeminiText(await response.json());
      if (!text) {
        throw new ProviderError("INVALID_RESPONSE", "服务商未返回可解析内容");
      }

      return sanitizeProductIdentity(parseModelJson(text));
    } catch (error) {
      const normalized = normalizeProviderError(error);
      throw new ProviderError(normalized.code, normalized.message, {
        httpStatus: normalized.httpStatus,
      });
    }
  },
  async createImagePlan(config, input) {
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
      }
      if (!config.capabilities?.includes("text")) {
        throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未勾选 text 能力");
      }

      const suffix = `${geminiModelPath(config.modelId)}:generateContent`;
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: geminiHeaders(config, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: IMAGE_PLANNING_PROMPT },
                { text: JSON.stringify(input) },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        await throwGeminiError(response, "五图策划请求失败");
      }

      const text = readGeminiText(await response.json());
      if (!text) {
        throw new ProviderError("INVALID_RESPONSE", "服务商未返回可解析内容");
      }

      return sanitizeImagePlans(parsePlanningJson(text));
    } catch (error) {
      const normalized = normalizeProviderError(error);
      throw new ProviderError(normalized.code, normalized.message, {
        httpStatus: normalized.httpStatus,
      });
    }
  },
  async generateImage(config, input) {
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
      }
      if (!config.capabilities?.includes("image")) {
        throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未勾选 image 能力");
      }
      if (config.protocol !== "gemini-native-image") {
        throw new ProviderError("UNSUPPORTED_PROTOCOL", "Gemini 图片生成必须使用 gemini-native-image");
      }

      const promptInput = [
        { type: "text", text: input.prompt },
        ...input.referenceImages.map((image) => ({
          type: "image",
          mime_type: image.mimeType,
          data: image.data.toString("base64"),
        })),
      ];

      const response = await providerFetch(safeJoinUrl(config.baseUrl, "interactions"), {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: {
          "x-goog-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.modelId,
          input: promptInput,
          response_format: {
            type: "image",
            aspect_ratio: input.output.aspectRatio || "1:1",
            image_size: input.output.resolution || "1K",
          },
        }),
      });

      if (!response.ok) {
        throw new ProviderError(await classifyGeminiError(response), "图片生成请求失败", {
          httpStatus: response.status,
        });
      }

      const images = readGeminiInteractionImages(await response.json());
      if (!images.length) {
        throw new ProviderError("INVALID_IMAGE_RESPONSE", "服务商未返回图片");
      }

      return {
        mode: "sync",
        status: "completed",
        externalTaskId: null,
        images: images.slice(0, 1),
        error: null,
        rawMetadata: {},
      };
    } catch (error) {
      const normalized = normalizeProviderError(error);
      throw new ProviderError(normalized.code, normalized.message, {
        httpStatus: normalized.httpStatus,
      });
    }
  },
  async checkGeneration() {
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "Gemini 原生图片生成是同步协议");
  },
  normalizeError: normalizeProviderError,
};
