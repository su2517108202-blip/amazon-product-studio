import { redactSecrets } from "@/lib/security";
import { fetch as undiciFetch, ProxyAgent } from "undici";

let proxyDispatcher = null;
let proxyDispatcherUrl = "";

function getProviderProxyDispatcher(url) {
  if (isLocalProviderUrl(url)) return undefined;
  const proxyUrl =
    process.env.PROVIDER_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    "";
  if (!proxyUrl) return undefined;
  if (proxyDispatcher && proxyDispatcherUrl === proxyUrl) return proxyDispatcher;
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
    return { ok: false, code: "TIMEOUT", message: "请求超时，请检查网络或调大超时时间", httpStatus: 0 };
  }
  if (error instanceof ProviderError) {
    return { ok: false, code: error.code, message: error.message, httpStatus: error.httpStatus || 0 };
  }
  if (error?.code) {
    return { ok: false, code: error.code, message: error.message || "供应商返回内容无效", httpStatus: error.httpStatus || 0 };
  }
  return { ok: false, code: "NETWORK_ERROR", message: redactSecrets(error?.message || "网络请求失败"), httpStatus: 0 };
}

export function classifyHttpError(status, bodyText = "") {
  if (status === 401) return "INVALID_API_KEY";
  if (status === 403) {
    const lowered = (bodyText || "").toLowerCase();
    if (lowered.includes("billing") || lowered.includes("quota") || lowered.includes("credit")) return "INSUFFICIENT_QUOTA";
    if (lowered.includes("model") || lowered.includes("access") || lowered.includes("permission")) return "MODEL_ACCESS_DENIED";
    return "INVALID_API_KEY";
  }
  if (status === 402) return "INSUFFICIENT_QUOTA";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 400) {
    const lowered = (bodyText || "").toLowerCase();
    if (lowered.includes("image") || lowered.includes("media") || lowered.includes("multipart")) return "IMAGE_INPUT_UNSUPPORTED";
    return "INVALID_REQUEST";
  }
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500 && status < 600) {
    if (status === 502 || status === 503 || status === 504) return "UPSTREAM_UNAVAILABLE";
    return "UPSTREAM_SERVER_ERROR";
  }
  return "UPSTREAM_ERROR";
}

export function humanErrorLabel(code) {
  const map = {
    INVALID_API_KEY: "API Key 无效或无权限",
    MISSING_API_KEY: "缺少 API Key",
    BILLING_REQUIRED: "需要启用计费（Gemini API 免费配额已用完或未关联结算账号）",
    QUOTA_EXCEEDED: "API 配额已用尽，请稍后重试或检查配额",
    MODEL_NOT_FOUND: "模型不存在或已被移除",
    MODEL_UNAVAILABLE_FOR_ACCOUNT: "当前账号无法使用该模型",
    MODEL_ACCESS_DENIED: "账号无权使用该模型",
    INSUFFICIENT_QUOTA: "账号额度不足",
    IMAGE_INPUT_UNSUPPORTED: "该模型不支持图片输入",
    CAPABILITY_MISMATCH: "模型能力不匹配",
    INVALID_REQUEST: "请求格式不正确",
    RATE_LIMITED: "请求过于频繁，请稍后重试",
    TIMEOUT: "请求超时",
    PROVIDER_TIMEOUT: "上游服务超时",
    PROVIDER_NETWORK_ERROR: "上游网络错误，请稍后重试",
    UPSTREAM_UNAVAILABLE: "上游服务暂时不可用",
    UPSTREAM_SERVER_ERROR: "上游服务器错误",
    UPSTREAM_ERROR: "上游返回异常",
    NETWORK_ERROR: "网络连接失败",
    UNSUPPORTED_PROTOCOL: "不支持的协议",
    REFERENCE_IMAGES_UNSUPPORTED: "当前协议不支持参考图传输",
    INVALID_IMAGE_RESPONSE: "服务商返回无效图片",
  };
  return map[code] || code;
}

export async function providerFetch(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const dispatcher = getProviderProxyDispatcher(url);
  try {
    const fetchImpl = dispatcher ? undiciFetch : fetch;
    return await fetchImpl(url, { ...options, ...(dispatcher ? { dispatcher } : {}), signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ProviderError("NETWORK_ERROR", "网络连接失败", { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

function isLocalProviderUrl(value) {
  try { const { hostname } = new URL(value); return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"; } catch { return false; }
}

export function safeJoinUrl(baseUrl, suffix) {
  try { return new URL(suffix, `${baseUrl.replace(/\/+$/, "")}/`).toString(); }
  catch { throw new ProviderError("INVALID_BASE_URL", "Base URL 格式不正确"); }
}
