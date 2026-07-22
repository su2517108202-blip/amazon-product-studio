import { deepSeekAdapter } from "./deepseek";
import { doubaoAdapter } from "./doubao";
import { geminiAdapter } from "./gemini";
import { openAIAdapter } from "./openai";
import { openAICompatibleAdapter } from "./openai-compatible";
import { ProviderError } from "./errors";

const adapters = {
  openai: openAIAdapter,
  gemini: geminiAdapter,
  deepseek: deepSeekAdapter,
  doubao: doubaoAdapter,
  "openai-compatible": openAICompatibleAdapter,
};

export function getProviderAdapter(provider) {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new ProviderError("UNSUPPORTED_PROVIDER", "供应商不受支持");
  }
  return adapter;
}

export function listProviderAdapters() {
  return Object.keys(adapters);
}
