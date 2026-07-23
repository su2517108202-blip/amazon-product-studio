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
  try {
    const data = await response.clone().json();
    const errors = Array.isArray(data) ? data : [data];
    const text = errors
      .map((item) => `${item?.error?.status || ""} ${item?.error?.message || ""} ${JSON.stringify(item?.error?.details || [])}`)
      .join(" ");
    if (/api.?key|credential|unauthenticated|permission/i.test(text)) return "INVALID_API_KEY";
    if (/model/i.test(text)) return "MODEL_NOT_FOUND";
  } catch {}
  return classifyHttpError(response.status);
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
        throw new ProviderError("MISSING_API_KEY", "Missing API Key");
      }

      const suffix = geminiModelPath(config.modelId);
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "GET",
        timeoutMs: config.timeoutMs,
        headers: geminiHeaders(config),
      });

      if (!response.ok) {
        throw new ProviderError(classifyHttpError(response.status), "Provider test failed", {
          httpStatus: response.status,
        });
      }

      return {
        ok: true,
        provider: config.provider,
        modelId: config.modelId,
        latencyMs: Date.now() - startedAt,
        message: "Connection succeeded",
      };
    } catch (error) {
      return normalizeProviderError(error);
    }
  },
  async listModels(config) {
    const startedAt = Date.now();
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "Missing API Key");
      }

      const response = await providerFetch(safeJoinUrl(config.baseUrl, "models"), {
        method: "GET",
        timeoutMs: config.timeoutMs,
        headers: geminiHeaders(config),
      });

      if (!response.ok) {
        throw new ProviderError(classifyHttpError(response.status), "Unable to read models", {
          httpStatus: response.status,
        });
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
        message: models.length ? "Models loaded" : "Provider returned no models",
      };
    } catch (error) {
      return normalizeProviderError(error);
    }
  },
  async analyzeProduct(config, input) {
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "Missing API Key");
      }
      if (!config.capabilities?.includes("vision")) {
        throw new ProviderError("CAPABILITY_MISMATCH", "Model is not marked as vision capable");
      }

      const parts = [
        {
          text: `${PRODUCT_ANALYSIS_PROMPT}\n\nProject: ${input.project.name || ""}\nProduct hint: ${input.project.productName || ""}`,
        },
        {
          text: `Reference image order and roles: ${input.images
            .map((image, index) => `${index + 1}. ${image.role}${image.isPrimary ? " primary" : ""}`)
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
        throw new ProviderError(classifyHttpError(response.status), "Vision analysis request failed", {
          httpStatus: response.status,
        });
      }

      const text = readGeminiText(await response.json());
      if (!text) {
        throw new ProviderError("INVALID_RESPONSE", "Provider returned no parseable content");
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
        throw new ProviderError("MISSING_API_KEY", "Missing API Key");
      }
      if (!config.capabilities?.includes("text")) {
        throw new ProviderError("CAPABILITY_MISMATCH", "Model is not marked as text capable");
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
        throw new ProviderError(classifyHttpError(response.status), "Image planning request failed", {
          httpStatus: response.status,
        });
      }

      const text = readGeminiText(await response.json());
      if (!text) {
        throw new ProviderError("INVALID_RESPONSE", "Provider returned no parseable content");
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
        throw new ProviderError("MISSING_API_KEY", "Missing API Key");
      }
      if (!config.capabilities?.includes("image")) {
        throw new ProviderError("CAPABILITY_MISMATCH", "Model is not marked as image capable");
      }
      if (config.protocol !== "gemini-native-image") {
        throw new ProviderError("UNSUPPORTED_PROTOCOL", "Gemini image generation requires gemini-native-image");
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
        throw new ProviderError(await classifyGeminiError(response), "Image generation request failed", {
          httpStatus: response.status,
        });
      }

      const images = readGeminiInteractionImages(await response.json());
      if (!images.length) {
        throw new ProviderError("INVALID_IMAGE_RESPONSE", "Provider returned no image");
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
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "Gemini native image generation is synchronous");
  },
  normalizeError: normalizeProviderError,
};
