import "dotenv/config";
import assert from "node:assert/strict";
import { inferModelCapabilities, inferProviderProtocol, roleAcceptanceLevel, ACCEPTANCE_LABELS } from "../src/lib/provider-profiles.js";

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { console.error(`  ❌ ${name}: ${e.message}`); failures++; }
}

console.log("\n=== Capability Inference (P1-9) ===\n");

test("gpt-4o has text+vision", () => {
  const c = inferModelCapabilities("openai", "gpt-4o");
  assert(c.includes("text"));
  assert(c.includes("vision"));
  assert(!c.includes("image"));
  assert(!c.includes("reasoning"));
});

test("gpt-image-1 has image, NOT text, NOT vision", () => {
  const c = inferModelCapabilities("openai", "gpt-image-1");
  assert(c.includes("image"));
  assert(!c.includes("text"));
  assert(!c.includes("vision"));
});

test("whisper-1 has NO text", () => {
  const c = inferModelCapabilities("openai", "whisper-1");
  assert(!c.includes("text"));
});

test("tts-1 has NO text", () => {
  const c = inferModelCapabilities("openai", "tts-1");
  assert(!c.includes("text"));
});

test("text-embedding-3-small has NO text", () => {
  const c = inferModelCapabilities("openai", "text-embedding-3-small");
  assert(!c.includes("text"));
});

test("dall-e-3 has NO text, has image", () => {
  const c = inferModelCapabilities("openai", "dall-e-3");
  assert(!c.includes("text"));
  assert(c.includes("image"));
});

test("gemini-2.5-flash has text+vision", () => {
  const c = inferModelCapabilities("gemini", "gemini-2.5-flash");
  assert(c.includes("text"));
  assert(c.includes("vision"));
});

test("gemini-embedding-text-001 has NO text, NO vision", () => {
  const c = inferModelCapabilities("gemini", "embedding-text-001");
  assert(!c.includes("text"));
  assert(!c.includes("vision"));
});

test("gemini-aqa has NO text, NO vision", () => {
  const c = inferModelCapabilities("gemini", "gemini-aqa");
  assert(!c.includes("text"));
  assert(!c.includes("vision"));
});

test("deepseek-chat has text, NO vision, NO image", () => {
  const c = inferModelCapabilities("deepseek", "deepseek-chat");
  assert(c.includes("text"));
  assert(!c.includes("vision"));
  assert(!c.includes("image"));
});

test("o3-mini has reasoning", () => {
  const c = inferModelCapabilities("openai", "o3-mini");
  assert(c.includes("reasoning"));
});

test("gpt-image-1 protocol = openai-images", () => {
  const c = inferModelCapabilities("openai", "gpt-image-1");
  assert.equal(inferProviderProtocol("openai", "gpt-image-1", c), "openai-images");
});

console.log("\n=== Role Acceptance (P1-10) ===\n");

test("gemini flash vision → accepted for product_vision", () => {
  const level = roleAcceptanceLevel("product_vision", {
    enabled: true, provider: "gemini", modelId: "gemini-2.5-flash",
    capabilities: ["text", "vision"], protocol: "gemini-native-image"
  });
  assert.notEqual(level, "unsupported");
});

test("deepseek → unsupported for image_generation", () => {
  assert.equal(roleAcceptanceLevel("image_generation", {
    enabled: true, provider: "deepseek", modelId: "deepseek-chat",
    capabilities: ["text"], protocol: "openai-compatible"
  }), "unsupported");
});

test("gpt-image-1 → NOT unsupported for image_generation", () => {
  assert.notEqual(roleAcceptanceLevel("image_generation", {
    enabled: true, provider: "openai", modelId: "gpt-image-1",
    capabilities: ["image"], protocol: "openai-images",
    supportsReferenceImages: false, referenceImageSupportStatus: "text_only"
  }), "unsupported");
});

test("disabled profile → unsupported", () => {
  assert.equal(roleAcceptanceLevel("image_generation", {
    enabled: false, provider: "gemini", modelId: "x",
    capabilities: ["text", "vision", "image"], protocol: "gemini-native-image"
  }), "unsupported");
});

test("ACCEPTANCE_LABELS has 5 levels", () => {
  const keys = Object.keys(ACCEPTANCE_LABELS);
  assert(keys.includes("official"));
  assert(keys.includes("adapterVerified"));
  assert(keys.includes("inferred"));
  assert(keys.includes("unverified"));
  assert(keys.includes("unsupported"));
});

console.log(`\n${failures === 0 ? "✅ All tests passed" : `❌ ${failures} failed`}`);
process.exit(failures > 0 ? 1 : 0);
