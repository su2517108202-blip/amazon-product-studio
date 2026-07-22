import { createBaseAdapter } from "./types";
import {
  classifyHttpError,
  normalizeProviderError,
  ProviderError,
  providerFetch,
  safeJoinUrl,
} from "./errors";

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

export const openAIAdapter = {
  ...createBaseAdapter("openai"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  normalizeError: normalizeProviderError,
};

export { testOpenAICompatible, listOpenAICompatibleModels };
