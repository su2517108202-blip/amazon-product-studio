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

async function testOpenAICompatible(config) {
  const startedAt = Date.now();
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "Missing API Key");
    }

    const response = await providerFetch(
      safeJoinUrl(config.baseUrl, `models/${encodeURIComponent(config.modelId)}`),
      {
        method: "GET",
        timeoutMs: config.timeoutMs,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
    );

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
}

async function listOpenAICompatibleModels(config) {
  const startedAt = Date.now();
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "Missing API Key");
    }

    const response = await providerFetch(safeJoinUrl(config.baseUrl, "models"), {
      method: "GET",
      timeoutMs: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new ProviderError(classifyHttpError(response.status), "Unable to read models", {
        httpStatus: response.status,
      });
    }

    const data = await response.json();
    const models = Array.isArray(data.data)
      ? data.data.map((item) => item.id).filter(Boolean)
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
}

async function analyzeOpenAICompatibleProduct(config, input) {
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "Missing API Key");
    }
    if (!config.capabilities?.includes("vision")) {
      throw new ProviderError("CAPABILITY_MISMATCH", "Model is not marked as vision capable");
    }

    const content = [
      {
        type: "text",
        text: `${PRODUCT_ANALYSIS_PROMPT}\n\nProject: ${input.project.name || ""}\nProduct hint: ${input.project.productName || ""}`,
      },
      {
        type: "text",
        text: `Reference image order and roles: ${input.images
          .map((image, index) => `${index + 1}. ${image.role}${image.isPrimary ? " primary" : ""}`)
          .join("; ")}`,
      },
      ...input.images.map((image) => ({
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
        },
      })),
    ];

    const response = await providerFetch(safeJoinUrl(config.baseUrl, "chat/completions"), {
      method: "POST",
      timeoutMs: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: "user", content }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new ProviderError(classifyHttpError(response.status), "Vision analysis request failed", {
        httpStatus: response.status,
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
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
}

async function createOpenAICompatibleImagePlan(config, input) {
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "Missing API Key");
    }
    if (!config.capabilities?.includes("text")) {
      throw new ProviderError("CAPABILITY_MISMATCH", "Model is not marked as text capable");
    }

    const response = await providerFetch(safeJoinUrl(config.baseUrl, "chat/completions"), {
      method: "POST",
      timeoutMs: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: "system", content: IMAGE_PLANNING_PROMPT },
          { role: "user", content: JSON.stringify(input) },
        ],
        temperature: 0.35,
      }),
    });

    if (!response.ok) {
      throw new ProviderError(classifyHttpError(response.status), "Image planning request failed", {
        httpStatus: response.status,
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
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
}

export const openAIAdapter = {
  ...createBaseAdapter("openai"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  analyzeProduct: analyzeOpenAICompatibleProduct,
  createImagePlan: createOpenAICompatibleImagePlan,
  normalizeError: normalizeProviderError,
};

export {
  testOpenAICompatible,
  listOpenAICompatibleModels,
  analyzeOpenAICompatibleProduct,
  createOpenAICompatibleImagePlan,
};
