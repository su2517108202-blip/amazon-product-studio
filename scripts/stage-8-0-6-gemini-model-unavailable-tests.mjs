import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  modelSupportsRole,
  resolveEffectiveModelCapability,
  sortModelsForRole,
} from "../src/lib/model-capabilities.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  gemini: await read("src/lib/providers/gemini.js"),
  analyze: await read("src/app/api/projects/[projectId]/analyze/route.js"),
  settings: await read("src/app/settings/providers/ProviderSettingsClient.js"),
  availability: await read("src/lib/model-availability.js"),
  errors: await read("src/lib/providers/errors.js"),
};

let assertionCount = 0;

test("Gemini new-user 404 is mapped to MODEL_UNAVAILABLE_FOR_ACCOUNT", () => {
  assert.match(files.gemini, /isGeminiAccountUnavailableError/);
  assert.match(files.gemini, /MODEL_UNAVAILABLE_FOR_ACCOUNT/);
  assert.match(files.availability, /no longer available to new users/);
  assert.match(files.errors, /MODEL_UNAVAILABLE_FOR_ACCOUNT: "当前账号无法使用该模型"/);
});

test("Gemini 3.6 Flash is the product vision recommendation before 3.5 and 2.5", () => {
  const models = [
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
  ].map((modelId) => resolveEffectiveModelCapability({ provider: "gemini", modelId }));
  const sorted = sortModelsForRole("product_vision", models);
  assert.equal(sorted[0].modelId, "gemini-3.6-flash");
  assert(modelSupportsRole("product_vision", sorted[0]));
  assert(!sorted[0].capabilities.includes("image"));
});

test("Gemini 3.6 is not fabricated when the official list does not include it", () => {
  assert.match(files.availability, /for \(const preferredId of GEMINI_PRODUCT_VISION_REPLACEMENTS\)/);
  assert.doesNotMatch(files.availability, /push\(\s*["']gemini-3\.6-flash/);
  assert.doesNotMatch(files.settings, /push\(\s*["']gemini-3\.6-flash/);
});

test("product vision migration updates only product_vision and respects locked roles", () => {
  assert.match(files.settings, /product-vision-migrate-model-button/);
  assert.match(files.settings, /onAssignRole\(role, selectedProfileId, migration\.modelId, true\)/);
  assert.match(files.settings, /当前角色已锁定，不会后台静默覆盖/);
  assert.match(files.settings, /if \(lockedRoles\[role\]\) continue/);
  const applyMigration = files.settings.match(/function applyMigration\(\) \{[^]*?\n  \}/)?.[0] || "";
  assert.match(applyMigration, /onAssignRole\(role, selectedProfileId, migration\.modelId, true\)/);
  assert.doesNotMatch(applyMigration, /image_planning|image_generation/);
});

test("analyze errors return migration metadata and do not trigger paid image generation", () => {
  assert.match(files.analyze, /suggestedMigration/);
  assert.match(files.analyze, /markModelUnavailableForAccount/);
  assert.match(files.analyze, /buildGeminiReplacementCandidates/);
  assert.doesNotMatch(files.analyze, /generateImage\(/);
});

function test(name, fn) {
  fn();
  assertionCount += 1;
  console.log(`  OK ${name}`);
}

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

console.log(`stage-8-0-6 gemini model unavailable checks passed (${assertionCount} tests)`);
