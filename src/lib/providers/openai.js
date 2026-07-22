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

async function testOpenAICompatible(config) {
  const startedAt = Date.now();
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "请先填写 API Key");
    }

    const url = safeJoinUrl(config.baseUrl, `models/${encodeURIComponent(config.modelId)}`);
    const response = await providerFetch(url, {
      method: "GET",
      timeoutMs: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        classifyHttpError(response.status),
        response.status === 404 ? "模型不存在或不可访问" : "供应商返回错误",
        { httpStatus: response.status },
      );
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
      throw new ProviderError("MISSING_API_KEY", "请先填写 API Key");
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
      message: models.length ? "已读取模型列表" : "供应商未返回模型列表",
    };
  } catch (error) {
    return normalizeProviderError(error);
  }
}

async function analyzeOpenAICompatibleProduct(config, input) {
  try {
    if (!config.apiKey) {
      throw new ProviderError("MISSING_API_KEY", "请先填写 API Key");
    }
    if (!config.capabilities?.includes("vision")) {
      throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未声明 vision 能力");
    }

    const content = [
      {
        type: "text",
        text: `${PRODUCT_ANALYSIS_PROMPT}\n\n项目名称：${input.project.name || ""}\n商品名称线索：${input.project.productName || ""}`,
      },
      {
        type: "text",
        text: `参考图顺序与角色：${input.images
          .map(
            (image, index) =>
              `${index + 1}. ${image.role}${image.isPrimary ? "（主参考图）" : ""}`,
          )
          .join("；")}`,
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
        messages: [
          {
            role: "user",
            content,
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new ProviderError(classifyHttpError(response.status), "视觉识别请求失败", {
        httpStatus: response.status,
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new ProviderError("INVALID_RESPONSE", "供应商未返回可解析内容");
    }

    return sanitizeProductIdentity(parseModelJson(text));
  } catch (error) {
    const normalized = normalizeProviderError(error);
    const wrapped = new ProviderError(normalized.code, normalized.message, {
      httpStatus: normalized.httpStatus,
    });
    throw wrapped;
  }
}

export const openAIAdapter = {
  ...createBaseAdapter("openai"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  analyzeProduct: analyzeOpenAICompatibleProduct,
  normalizeError: normalizeProviderError,
};

export {
  testOpenAICompatible,
  listOpenAICompatibleModels,
  analyzeOpenAICompatibleProduct,
};
