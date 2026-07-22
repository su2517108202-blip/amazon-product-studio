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

function geminiModelPath(modelId) {
  return modelId.startsWith("models/") ? modelId : `models/${modelId}`;
}

export const geminiAdapter = {
  ...createBaseAdapter("gemini"),
  async testConnection(config) {
    const startedAt = Date.now();
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "请先填写 API Key");
      }

      const suffix = `${geminiModelPath(config.modelId)}?key=${encodeURIComponent(config.apiKey)}`;
      const response = await providerFetch(safeJoinUrl(config.baseUrl, suffix), {
        method: "GET",
        timeoutMs: config.timeoutMs,
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
  },
  async listModels(config) {
    const startedAt = Date.now();
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "请先填写 API Key");
      }

      const response = await providerFetch(
        safeJoinUrl(config.baseUrl, `models?key=${encodeURIComponent(config.apiKey)}`),
        {
          method: "GET",
          timeoutMs: config.timeoutMs,
        },
      );

      if (!response.ok) {
        throw new ProviderError(classifyHttpError(response.status), "无法读取模型列表", {
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
        message: models.length ? "已读取模型列表" : "供应商未返回模型列表",
      };
    } catch (error) {
      return normalizeProviderError(error);
    }
  },
  async analyzeProduct(config, input) {
    try {
      if (!config.apiKey) {
        throw new ProviderError("MISSING_API_KEY", "请先填写 API Key");
      }
      if (!config.capabilities?.includes("vision")) {
        throw new ProviderError("CAPABILITY_MISMATCH", "当前模型未声明 vision 能力");
      }

      const parts = [
        {
          text: `${PRODUCT_ANALYSIS_PROMPT}\n\n项目名称：${input.project.name || ""}\n商品名称线索：${input.project.productName || ""}`,
        },
        {
          text: `参考图顺序与角色：${input.images
            .map(
              (image, index) =>
                `${index + 1}. ${image.role}${image.isPrimary ? "（主参考图）" : ""}`,
            )
            .join("；")}`,
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
        throw new ProviderError(classifyHttpError(response.status), "视觉识别请求失败", {
          httpStatus: response.status,
        });
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

      if (!text) {
        throw new ProviderError("INVALID_RESPONSE", "供应商未返回可解析内容");
      }

      return sanitizeProductIdentity(parseModelJson(text));
    } catch (error) {
      const normalized = normalizeProviderError(error);
      throw new ProviderError(normalized.code, normalized.message, {
        httpStatus: normalized.httpStatus,
      });
    }
  },
  normalizeError: normalizeProviderError,
};
