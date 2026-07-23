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

function normalizeOpenAIImages(data) {
  const items = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.images)
      ? data.images
      : [];
  return items
    .map((item) => ({
      data: item.b64_json ? Buffer.from(item.b64_json, "base64") : null,
      url: item.url || null,
      mimeType: item.mimeType || item.mime_type || "image/png",
    }))
    .filter((item) => item.data || item.url);
}

async function generateOpenAIImage(config, input) {
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "Missing API Key");
    }
    if (!config.capabilities?.includes("image") && !config.capabilities?.includes("asyncImage")) {
      throw new ProviderError("CAPABILITY_MISMATCH", "Model is not marked as image capable");
    }

    if (config.protocol === "openai-image-edit") {
      return generateOpenAIImageEdit(config, input);
    }
    if (config.protocol === "generic-async-image") {
      return submitGenericAsyncImage(config, input);
    }
    if (config.protocol !== "openai-images" && config.protocol !== "doubao-image") {
      throw new ProviderError("UNSUPPORTED_PROTOCOL", "Image generation protocol is not supported");
    }

    const response = await providerFetch(safeJoinUrl(config.baseUrl, "images/generations"), {
      method: "POST",
      timeoutMs: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        prompt: input.prompt,
        n: 1,
        size: imageSizeForOutput(input.output),
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      throw new ProviderError(classifyHttpError(response.status), "Image generation request failed", {
        httpStatus: response.status,
      });
    }

    const images = normalizeOpenAIImages(await response.json());
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
}

async function generateOpenAIImageEdit(config, input) {
  const formData = new FormData();
  formData.set("model", config.modelId);
  formData.set("prompt", input.prompt);
  formData.set("n", "1");
  formData.set("size", imageSizeForOutput(input.output));
  formData.set("response_format", "b64_json");

  input.referenceImages.forEach((image, index) => {
    const file = new Blob([image.data], { type: image.mimeType });
    formData.append(index === 0 ? "image" : "image[]", file, `${image.role || "reference"}-${index + 1}.png`);
  });

  const response = await providerFetch(safeJoinUrl(config.baseUrl, "images/edits"), {
    method: "POST",
    timeoutMs: config.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new ProviderError(classifyHttpError(response.status), "Image edit request failed", {
      httpStatus: response.status,
    });
  }

  const images = normalizeOpenAIImages(await response.json());
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
}

async function submitGenericAsyncImage(config, input) {
  const response = await providerFetch(safeJoinUrl(config.baseUrl, "generations"), {
    method: "POST",
    timeoutMs: config.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.modelId,
      prompt: input.prompt,
      aspectRatio: input.output.aspectRatio,
      resolution: input.output.resolution,
      count: 1,
    }),
  });

  if (!response.ok) {
    throw new ProviderError(classifyHttpError(response.status), "Async image request failed", {
      httpStatus: response.status,
    });
  }

  const data = await response.json();
  const taskId = data.id || data.taskId || data.task_id || data.requestId;
  if (!taskId) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Provider returned no async task id");
  }

  return {
    mode: "async",
    status: "processing",
    externalTaskId: String(taskId),
    images: [],
    error: null,
    rawMetadata: {},
  };
}

async function checkGenericAsyncImage(config, task) {
  if (config.protocol !== "generic-async-image") {
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "Async check is not supported by this protocol");
  }
  const response = await providerFetch(safeJoinUrl(config.baseUrl, `generations/${encodeURIComponent(task.externalTaskId)}`), {
    method: "GET",
    timeoutMs: config.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new ProviderError(classifyHttpError(response.status), "Async image check failed", {
      httpStatus: response.status,
    });
  }

  const data = await response.json();
  const status = normalizeAsyncStatus(data.status);
  const images = status === "completed" ? normalizeOpenAIImages(data) : [];
  return {
    mode: "async",
    status,
    externalTaskId: task.externalTaskId,
    images,
    error: data.error ? { message: String(data.error).slice(0, 500) } : null,
    rawMetadata: {},
  };
}

function normalizeAsyncStatus(status) {
  if (["completed", "succeeded", "success", "done"].includes(status)) return "completed";
  if (["failed", "error", "expired"].includes(status)) return "failed";
  return "processing";
}

function imageSizeForOutput(output = {}) {
  if (output.aspectRatio === "16:9") return output.resolution === "2K" ? "1792x1024" : "1024x576";
  if (output.aspectRatio === "9:16") return output.resolution === "2K" ? "1024x1792" : "576x1024";
  return output.resolution === "2K" ? "1536x1536" : "1024x1024";
}

export const openAIAdapter = {
  ...createBaseAdapter("openai"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  analyzeProduct: analyzeOpenAICompatibleProduct,
  createImagePlan: createOpenAICompatibleImagePlan,
  generateImage: generateOpenAIImage,
  checkGeneration: checkGenericAsyncImage,
  normalizeError: normalizeProviderError,
};

export {
  testOpenAICompatible,
  listOpenAICompatibleModels,
  analyzeOpenAICompatibleProduct,
  createOpenAICompatibleImagePlan,
  generateOpenAIImage,
  checkGenericAsyncImage,
};
