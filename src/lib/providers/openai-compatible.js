import {
  listOpenAICompatibleModels,
  testOpenAICompatible,
} from "./openai";
import { createBaseAdapter } from "./types";
import { normalizeProviderError } from "./errors";

export const openAICompatibleAdapter = {
  ...createBaseAdapter("openai-compatible"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  normalizeError: normalizeProviderError,
};
