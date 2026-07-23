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

export const geminiAdapter = {
  ...createBaseAdapter("gemini"),
  async testConnection(config) {
    const startedAt = Date.now();
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "Missing API Key");
      }

      const suffix = `${geminiModelPath(config.modelId)}?key=${encodeURIComponent(config.apiKey)}`;
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "GET",
        timeoutMs: config.timeoutMs,
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

      const response = await providerFetch(
        safeJoinUrl(config.baseUrl, `models?key=${encodeURIComponent(config.apiKey)}`),
        {
          method: "GET",
          timeoutMs: config.timeoutMs,
        },
      );

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

      const suffix = `${geminiModelPath(config.modelId)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: {
          "Content-Type": "application/json",
        },
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

      const suffix = `${geminiModelPath(config.modelId)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: {
          "Content-Type": "application/json",
        },
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
  normalizeError: normalizeProviderError,
};
