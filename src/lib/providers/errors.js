import { redactSecrets } from "@/lib/security";
import { fetch as undiciFetch, ProxyAgent } from "undici";

let proxyDispatcher = null;
let proxyDispatcherUrl = "";

function getProviderProxyDispatcher() {
  const proxyUrl =
    process.env.PROVIDER_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    "";

  if (!proxyUrl) return undefined;

  if (proxyDispatcher && proxyDispatcherUrl === proxyUrl) {
    return proxyDispatcher;
  }

  proxyDispatcherUrl = proxyUrl;
  proxyDispatcher = new ProxyAgent(proxyUrl);
  return proxyDispatcher;
}

export class ProviderError extends Error {
  constructor(code, message, { httpStatus = 0, cause } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.cause = cause;
  }
}

export function disabledStageMethod() {
  throw new ProviderError("NOT_ENABLED_IN_STAGE", "本阶段尚未启用该业务调用");
}

export function normalizeProviderError(error) {
  if (error?.name === "AbortError") {
    return {
      ok: false,
      code: "TIMEOUT",
      message: "请求超时，请检查网络或调大超时时间",
      httpStatus: 0,
    };
  }

  if (error instanceof ProviderError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus || 0,
    };
  }

  if (error?.code) {
    return {
      ok: false,
      code: error.code,
      message: error.message || "供应商返回内容无效",
      httpStatus: error.httpStatus || 0,
    };
  }

  return {
    ok: false,
    code: "NETWORK_ERROR",
    message: redactSecrets(error?.message || "网络请求失败"),
    httpStatus: 0,
  };
}

export function classifyHttpError(status) {
  if (status === 401 || status === 403) return "INVALID_API_KEY";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 402) return "INSUFFICIENT_QUOTA";
  return "UPSTREAM_ERROR";
}

export async function providerFetch(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const dispatcher = getProviderProxyDispatcher();

  try {
    const fetchImpl = dispatcher ? undiciFetch : fetch;

    return await fetchImpl(url, {
      ...options,
      ...(dispatcher ? { dispatcher } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ProviderError("NETWORK_ERROR", "网络连接失败", { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export function safeJoinUrl(baseUrl, suffix) {
  try {
    return new URL(suffix, `${baseUrl.replace(/\/+$/, "")}/`).toString();
  } catch {
    throw new ProviderError("INVALID_BASE_URL", "Base URL 格式不正确");
  }
}
