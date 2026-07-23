import {
  analyzeOpenAICompatibleProduct,
  checkGenericAsyncImage,
  createOpenAICompatibleImagePlan,
  generateOpenAIImage,
  listOpenAICompatibleModels,
  testOpenAICompatible,
} from "./openai";
import { createBaseAdapter } from "./types";
import { normalizeProviderError } from "./errors";

export const openAICompatibleAdapter = {
  ...createBaseAdapter("openai-compatible"),
  testConnection: testOpenAICompatible,
  listModels: listOpenAICompatibleModels,
  analyzeProduct: analyzeOpenAICompatibleProduct,
  createImagePlan: createOpenAICompatibleImagePlan,
  generateImage: generateOpenAIImage,
  checkGeneration: checkGenericAsyncImage,
  normalizeError: normalizeProviderError,
};
