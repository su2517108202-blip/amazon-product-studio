import {
  analyzeOpenAICompatibleProduct,
  createOpenAICompatibleImagePlan,
  listOpenAICompatibleModels,
  testOpenAICompatible,
} from "./openai";
import { createBaseAdapter } from "./types";
import { normalizeProviderError } from "./errors";

export const doubaoAdapter = {
  ...createBaseAdapter("doubao"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  analyzeProduct: analyzeOpenAICompatibleProduct,
  createImagePlan: createOpenAICompatibleImagePlan,
  normalizeError: normalizeProviderError,
};
