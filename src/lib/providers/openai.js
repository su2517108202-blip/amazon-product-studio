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
import { supportsReferenceImagesProfile } from "@/lib/provider-profiles";

async function testOpenAICompatible(config) {
  const startedAt = Date.now();
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
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
      throw new ProviderError(classifyHttpError(response.status), "服务商连接测试失败", {
        httpStatus: response.status,
      });
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
}

async function listOpenAICompatibleModels(config) {
  const startedAt = Date.now();
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
    }

    const response = await providerFetch(safeJoinUrl(config.baseUrl, "models"), {
      method: "GET",
      timeoutMs: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new ProviderError(classifyHttpError(response.status), "无法读取模型列表", {
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
      message: models.length ? "模型列表已读取" : "服务商未返回模型列表",
    };
  } catch (error) {
    return normalizeProviderError(error);
  }
}

async function analyzeOpenAICompatibleProduct(config, input) {
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
    }
    if (!config.capabilities?.includes("vision")) {
      throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未勾选 vision 能力");
    }

    const content = [
      {
        type: "text",
        text: `${PRODUCT_ANALYSIS_PROMPT}\n\n项目：${input.project.name || ""}\n商品提示：${input.project.productName || ""}`,
      },
      {
        type: "text",
        text: `参考图顺序和角色：${input.images
          .map((image, index) => `${index + 1}. ${image.role}${image.isPrimary ? " 主参考图" : ""}`)
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
      throw new ProviderError(classifyHttpError(response.status), "商品识别请求失败", {
        httpStatus: response.status,
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
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
}

async function createOpenAICompatibleImagePlan(config, input) {
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
    }
    if (!config.capabilities?.includes("text")) {
      throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未勾选 text 能力");
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
      throw new ProviderError(classifyHttpError(response.status), "五图策划请求失败", {
        httpStatus: response.status,
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
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
      throw new ProviderError("MISSING_API_KEY", "缺少 API Key");
    }
    if (!config.capabilities?.includes("image") && !config.capabilities?.includes("asyncImage")) {
      throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未勾选 image 能力");
    }
    if (!supportsReferenceImagesProfile(config)) {
      throw new ProviderError(
        "REFERENCE_IMAGES_UNSUPPORTED",
        "当前图片生成协议不会真实传递参考图",
      );
    }

    if (config.protocol === "openai-image-edit") {
      return generateOpenAIImageEdit(config, input);
    }
    if (config.protocol === "generic-async-image") {
      return submitGenericAsyncImage(config, input);
    }
    if (config.protocol !== "openai-images" && config.protocol !== "doubao-image") {
      throw new ProviderError("UNSUPPORTED_PROTOCOL", "图片生成协议不受支持");
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
      throw new ProviderError(classifyHttpError(response.status), "图片生成请求失败", {
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
    throw new ProviderError(classifyHttpError(response.status), "图片编辑请求失败", {
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
    throw new ProviderError(classifyHttpError(response.status), "异步图片请求失败", {
      httpStatus: response.status,
    });
  }

  const data = await response.json();
  const taskId = parseGenericAsyncSubmit(data);
  if (!taskId) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "服务商未返回异步任务 ID");
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
    throw new ProviderError("UNSUPPORTED_PROTOCOL", "当前协议不支持异步检查");
  }
  const response = await providerFetch(safeJoinUrl(config.baseUrl, `generations/${encodeURIComponent(task.externalTaskId)}`), {
    method: "GET",
    timeoutMs: config.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new ProviderError(classifyHttpError(response.status), "异步图片状态检查失败", {
      httpStatus: response.status,
    });
  }

  const data = await response.json();
  const status = parseGenericAsyncStatus(data);
  const images = status === "completed" ? normalizeOpenAIImages(data) : [];
  if (status === "completed" && !images.length) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Provider completed without an image");
  }
  return {
    mode: "async",
    status,
    externalTaskId: task.externalTaskId,
    images,
    error: normalizeGenericAsyncError(data.error),
    rawMetadata: {},
  };
}

function parseGenericAsyncSubmit(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Generic async response must be an object");
  }
  if (typeof data.externalTaskId !== "string" || !data.externalTaskId.trim()) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Generic async response missing externalTaskId");
  }
  if (data.status && !["queued", "processing"].includes(data.status)) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Generic async submit status is invalid");
  }
  return data.externalTaskId.trim();
}

function parseGenericAsyncStatus(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Generic async check response must be an object");
  }
  if (!["processing", "completed", "failed"].includes(data.status)) {
    throw new ProviderError("INVALID_IMAGE_RESPONSE", "Generic async status is invalid");
  }
  return data.status;
}

function normalizeGenericAsyncError(error) {
  if (!error) return null;
  if (typeof error === "string") {
    return { code: "ASYNC_TASK_FAILED", message: error.slice(0, 500) };
  }
  if (typeof error === "object") {
    return {
      code: String(error.code || "ASYNC_TASK_FAILED").slice(0, 80),
      message: String(error.message || "异步图片生成失败").slice(0, 500),
    };
  }
  return { code: "ASYNC_TASK_FAILED", message: "异步图片生成失败" };
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
