import {
  createOpenAICompatibleImagePlan,
  listOpenAICompatibleModels,
  testOpenAICompatible,
} from "./openai";
import { createBaseAdapter } from "./types";
import { normalizeProviderError } from "./errors";

export const deepSeekAdapter = {
  ...createBaseAdapter("deepseek"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  createImagePlan: createOpenAICompatibleImagePlan,
  normalizeError: normalizeProviderError,
};
