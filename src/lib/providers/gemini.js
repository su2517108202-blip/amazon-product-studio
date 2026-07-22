import { createBaseAdapter } from "./types";
import {
  classifyHttpError,
  normalizeProviderError,
  ProviderError,
  providerFetch,
  safeJoinUrl,
} from "./errors";

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
  normalizeError: normalizeProviderError,
};
