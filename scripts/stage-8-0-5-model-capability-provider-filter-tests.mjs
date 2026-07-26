import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  formatModelOptionLabel,
  modelSearchText,
  modelSupportsRole,
  resolveEffectiveModelCapability,
  sortModelsForRole,
} from "../src/lib/model-capabilities.js";
import { inferModelCapabilities, inferProviderProtocol } from "../src/lib/provider-profiles.js";

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
}

console.log("\n=== Stage 8.0.5 V2 model capability/provider filter ===\n");

test("gemini-2.5-flash is vision-capable but not image generation", () => {
  const resolved = resolveEffectiveModelCapability({ provider: "gemini", modelId: "gemini-2.5-flash" });
  assert(resolved.capabilities.includes("text"));
  assert(resolved.capabilities.includes("vision"));
  assert(!resolved.capabilities.includes("image"));
  assert(modelSupportsRole("product_vision", resolved));
  assert(!modelSupportsRole("image_generation", resolved));
});

test("gemini-2.5-flash-image supports product vision and image generation", () => {
  const resolved = resolveEffectiveModelCapability({ provider: "gemini", modelId: "models/gemini-2.5-flash-image" });
  assert.equal(resolved.modelId, "gemini-2.5-flash-image");
  assert(resolved.capabilities.includes("vision"));
  assert(resolved.capabilities.includes("image"));
  assert.equal(resolved.supportsReferenceImages, true);
  assert(modelSupportsRole("product_vision", resolved));
  assert(modelSupportsRole("image_generation", resolved));
});

test("OpenAI GPT-4.1 mini supports vision but not image output", () => {
  const resolved = resolveEffectiveModelCapability({ provider: "openai", modelId: "gpt-4.1-mini" });
  assert(resolved.capabilities.includes("text"));
  assert(resolved.capabilities.includes("vision"));
  assert(!resolved.capabilities.includes("image"));
  assert(modelSupportsRole("product_vision", resolved));
  assert(!modelSupportsRole("image_generation", resolved));
});

test("OpenAI Compatible official vision IDs remain unverified, not unsupported", () => {
  const resolved = resolveEffectiveModelCapability({ provider: "openai-compatible", modelId: "gpt-4.1-mini" });
  assert(resolved.capabilities.includes("vision"));
  assert.equal(resolved.capabilityStatus, "unverified");
  assert.match(resolved.reason, /兼容接口未验证/);
  assert(modelSupportsRole("product_vision", resolved));
});

test("non-vision OpenAI models are explicitly unsupported for product vision", () => {
  for (const modelId of ["text-embedding-3-small", "tts-1"]) {
    const resolved = resolveEffectiveModelCapability({ provider: "openai", modelId });
    assert.equal(resolved.capabilityStatus, "unsupported");
    assert(!modelSupportsRole("product_vision", resolved));
  }
});

test("Nano Banana aliases and models/ prefix are normalized", () => {
  const banana = resolveEffectiveModelCapability({ provider: "gemini", modelId: "models/gemini-2.5-flash-image" });
  const banana2 = resolveEffectiveModelCapability({ provider: "gemini", modelId: "models/gemini-3.1-flash-image" });
  const pro = resolveEffectiveModelCapability({ provider: "gemini", modelId: "models/gemini-3-pro-image" });
  assert(modelSearchText(banana).includes("nano banana"));
  assert(modelSearchText(banana2).includes("nano banana 2"));
  assert(modelSearchText(pro).includes("nano banana pro"));
  assert.equal(banana2.modelId, "gemini-3.1-flash-image");
});

test("Nano Banana labels include display name, API ID, and purpose badge", () => {
  const resolved = resolveEffectiveModelCapability({ provider: "gemini", modelId: "models/gemini-3.1-flash-image" });
  assert.equal(formatModelOptionLabel(resolved), "Nano Banana 2｜gemini-3.1-flash-image｜热门首选");
});

test("hot stable models sort above ordinary, preview, and deprecated models", () => {
  const models = [
    resolveEffectiveModelCapability({ provider: "gemini", modelId: "gemini-2.5-flash-image" }),
    resolveEffectiveModelCapability({ provider: "gemini", modelId: "gemini-3.1-flash-image-preview" }),
    resolveEffectiveModelCapability({ provider: "gemini", modelId: "gemini-3.1-flash-image" }),
    resolveEffectiveModelCapability({ provider: "gemini", modelId: "custom-image-model" }),
  ];
  const sorted = sortModelsForRole("image_generation", models);
  assert.equal(sorted[0].modelId, "gemini-3.1-flash-image");
  assert.notEqual(sorted[0].lifecycle, "preview");
  assert.notEqual(sorted[0].lifecycle, "deprecated");
});

test("unreturned hot models are not fabricated into selectable lists", () => {
  const returned = [resolveEffectiveModelCapability({ provider: "gemini", modelId: "gemini-2.5-flash-image" })];
  const sorted = sortModelsForRole("image_generation", returned);
  assert.deepEqual(sorted.map((model) => model.modelId), ["gemini-2.5-flash-image"]);
});

test("legacy provider-profile inference delegates to effective model capability", () => {
  const caps = inferModelCapabilities("openai", "gpt-4.1-mini");
  assert(caps.includes("vision"));
  assert(!caps.includes("image"));
  assert.equal(inferProviderProtocol("gemini", "gemini-3.1-flash-image", ["image"]), "gemini-native-image");
});

test("settings role UI uses separate provider and model controls", () => {
  const settings = fs.readFileSync(path.join(process.cwd(), "src/app/settings/providers/ProviderSettingsClient.js"), "utf8");
  assert(settings.includes("使用哪个 AI 配置"));
  assert(settings.includes("使用该配置下的哪个模型"));
  assert(settings.includes("buildRoleModelsForProfile"));
  assert(!settings.includes("const allModels = buildRoleModels(profiles"));
});

test("generation route validates effective model capability, not profile default image flag", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/projects/[projectId]/image-plans/[planId]/generations/route.js"), "utf8");
  assert(route.includes("resolveEffectiveModelCapability"));
  assert(route.includes("effectiveCapability.capabilities.includes(\"image\")"));
  assert(!route.includes("supportsImageGenerationProfile(profile)"));
  assert(route.includes("当前绑定模型只支持图片理解，不支持图片输出"));
});

console.log(`\n${failures === 0 ? "OK All tests passed" : `FAIL ${failures} failed`}`);
process.exit(failures > 0 ? 1 : 0);
