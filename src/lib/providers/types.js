import { disabledStageMethod } from "./errors";

export function createBaseAdapter(provider) {
  return {
    provider,
    async analyzeProduct() {
      disabledStageMethod();
    },
    async createImagePlan() {
      disabledStageMethod();
    },
    async generateImage() {
      disabledStageMethod();
    },
    async checkGeneration() {
      disabledStageMethod();
    },
  };
}
