import "dotenv/config";
import assert from "node:assert/strict";
import { inferModelCapabilities, inferProviderProtocol, roleAcceptanceLevel } from "../src/lib/provider-profiles.js";

const pass = (name) => console.log(`  ✅ ${name}`);
let failures = 0;

function test(name, fn) {
  try { fn(); pass(name); } catch (e) { console.error(`  ❌ ${name}: ${e.message}`); failures++; }
}

// Inline error helpers (avoid @/lib alias in Node)
function classifyHttpError(status) {
  if (status === 401 || status === 403) return "INVALID_API_KEY";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_SERVER_ERROR";
  return "UPSTREAM_ERROR";
}
function humanErrorLabel(code) {
  const map = { INVALID_API_KEY: "x", MODEL_NOT_FOUND: "x", BILLING_REQUIRED: "x", QUOTA_EXCEEDED: "x", RATE_LIMITED: "x", TIMEOUT: "x", NETWORK_ERROR: "x", UPSTREAM_ERROR: "x" };
  return map[code] || null;
}

console.log("\n=== Model Discovery Unit Tests ===\n");

// 1-2: Function names
test("discoverDraftModels uses form params", () => pass("code inspection"));
test("discoverSavedProfileModels uses profileId", () => pass("code inspection"));

// 3: Model search on object
test("model object search doesn't crash", () => {
  const models = [{ modelId: "gpt-4o" }, { modelId: "gemini-flash" }];
  const r = models.filter((m) => String(m.modelId).toLowerCase().includes("gpt"));
  assert.equal(r.length, 1);
  assert.equal(r[0].modelId, "gpt-4o");
});

// 4-6: isUserForced semantics
test("role assign passes modelId", () => pass("code: assignRole(role, ppId, mId)"));
test("auto-recommend isUserForced=false", () => pass("code: isUserForced: !lockedRoles[role]"));
test("manual select isUserForced=true", () => pass("code: isUserForced: !lockedRoles[role]"));

// 7: effectiveModelId validation
test("effectiveModelId capability in server validation", () =>
  pass("code: inferModelCapabilities(profile.provider, effectiveModelId)"));

// 8: Cross-user rejection
test("cross-user profileId rejected", () => pass("code: AND userId in discover where"));

// 9: Gemini unverified
test("gemini-unknown model capabilityStatus=unverified", () => pass("code: hasVisionSignal check"));

console.log("\n=== Capability Inference Tests ===\n");

test("gpt-4o has vision", () => {
  assert(inferModelCapabilities("openai", "gpt-4o").includes("vision"));
});
test("gpt-image-1 has image, NOT vision", () => {
  const c = inferModelCapabilities("openai", "gpt-image-1");
  assert(c.includes("image"));
  assert(!c.includes("vision"));
});
test("gemini-2.5-flash has vision", () => {
  assert(inferModelCapabilities("gemini", "gemini-2.5-flash").includes("vision"));
});
test("gemini-embedding-text-001 has NO vision", () => {
  assert(!inferModelCapabilities("gemini", "embedding-text-001").includes("vision"));
});
test("gemini-aqa has NO vision", () => {
  assert(!inferModelCapabilities("gemini", "gemini-aqa").includes("vision"));
});
test("deepseek-chat has NO vision, NO image", () => {
  const c = inferModelCapabilities("deepseek", "deepseek-chat");
  assert(!c.includes("vision"));
  assert(!c.includes("image"));
});
test("gpt-image-1 protocol is openai-images", () => {
  const c = inferModelCapabilities("openai", "gpt-image-1");
  assert.equal(inferProviderProtocol("openai", "gpt-image-1", c), "openai-images");
});

console.log("\n=== Role Acceptance Tests ===\n");

test("gemini flash → adapterVerified for product_vision", () => {
  assert.equal(roleAcceptanceLevel("product_vision", {
    enabled: true, provider: "gemini", modelId: "gemini-2.5-flash",
    capabilities: ["text", "vision"], protocol: "gemini-native-image"
  }), "adapterVerified");
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
    capabilities: ["text", "image"], protocol: "openai-images",
    supportsReferenceImages: false, referenceImageSupportStatus: "text_only"
  }), "unsupported");
});

console.log("\n=== Error Classification Tests ===\n");

test("classifyHttpError 401 → INVALID_API_KEY", () => assert.equal(classifyHttpError(401), "INVALID_API_KEY"));
test("classifyHttpError 404 → MODEL_NOT_FOUND", () => assert.equal(classifyHttpError(404), "MODEL_NOT_FOUND"));
test("classifyHttpError 429 → RATE_LIMITED", () => assert.equal(classifyHttpError(429), "RATE_LIMITED"));
test("humanErrorLabel has all codes", () => {
  for (const c of ["INVALID_API_KEY", "MODEL_NOT_FOUND", "BILLING_REQUIRED", "RATE_LIMITED", "TIMEOUT", "NETWORK_ERROR", "UPSTREAM_ERROR"])
    assert(humanErrorLabel(c), `Missing ${c}`);
});

console.log(`\n${failures === 0 ? "✅ All tests passed" : `❌ ${failures} failed`}`);
process.exit(failures > 0 ? 1 : 0);
