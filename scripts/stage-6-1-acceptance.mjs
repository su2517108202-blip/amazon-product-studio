import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

const gemini = read("src/lib/providers/gemini.js");
assert(!gemini.includes("?key="), "Gemini requests must not place API keys in URLs");
assert(!gemini.includes("encodeURIComponent(config.apiKey)"), "Gemini API key must not be URL encoded into requests");
assert(gemini.includes('"x-goog-api-key": config.apiKey'), "Gemini requests must use x-goog-api-key header");

const storage = read("src/lib/storage.js");
assert(storage.includes("path.relative(root, target)"), "storage path checks must use path.relative");
assert(!storage.includes("target.startsWith(storageRoot)"), "storage path checks must not use unsafe prefix matching");
assert(storage.includes("decodeURIComponent(decoded)"), "storage path checks must reject encoded traversal");
assert(storage.includes('decoded.includes("/")'), "storage path checks must reject POSIX separator injection");
assert(storage.includes('decoded.includes("\\\\")'), "storage path checks must reject Windows separator injection");

const storageRoute = read("src/app/api/storage/[...path]/route.js");
assert(storageRoute.includes("requireCurrentUser"), "storage API must require the current user");
assert(storageRoute.includes("where: { id: projectId, userId }"), "storage API must check project ownership");
assert(storageRoute.includes("referenceImage.findFirst"), "storage API must verify reference image records");
assert(storageRoute.includes("generatedImage.findFirst"), "storage API must verify generated image records");
assert(!storageRoute.includes("error.message ||"), "storage API errors must not echo filesystem details");

const schema = read("prisma/schema.prisma");
assert(/outputIndex\s+Int/.test(schema), "GeneratedImage.outputIndex must exist");
assert(schema.includes("@@unique([generationRunId, outputIndex])"), "GeneratedImage output index must be unique per run");
assert(/checkAttempts\s+Int/.test(schema), "ImageGenerationRun.checkAttempts must exist");
assert(/lastCheckedAt\s+DateTime\?/.test(schema), "ImageGenerationRun.lastCheckedAt must exist");
assert(/expiresAt\s+DateTime\?/.test(schema), "ImageGenerationRun.expiresAt must exist");

const imageGeneration = read("src/lib/image-generation.js");
assert(imageGeneration.includes("REFERENCE_IMAGES_UNSUPPORTED"), "unsupported reference image protocols must be blocked");
assert(imageGeneration.includes("P2002"), "GeneratedImage persistence must handle unique conflicts");
assert(imageGeneration.includes("deleteStoredFile(stored.storageKey)"), "duplicate image files must be cleaned after conflicts");
assert(imageGeneration.includes("ASYNC_TASK_EXPIRED"), "async expiration must be represented");
assert(imageGeneration.includes("MAX_ASYNC_CHECK_ATTEMPTS"), "async checks must have a maximum attempt limit");

const checkRoute = read("src/app/api/image-generations/[generationRunId]/check/route.js");
assert(checkRoute.includes("run.status !== \"processing\" || run.mode !== \"async\""), "terminal runs must not check upstream again");
assert(checkRoute.includes("checkAttempts: { increment: 1 }"), "async checks must increment attempts");
assert(checkRoute.includes("TERMINAL_ASYNC_ERROR_CODES"), "terminal async errors must fail the run");

const profiles = read("src/lib/provider-profiles.js");
assert(profiles.includes('provider === "gemini") return protocol === "gemini-native-image"'), "Gemini native image must support references");
assert(profiles.includes('provider === "openai") return protocol === "openai-image-edit"'), "OpenAI edit must support references");
assert(profiles.includes('provider === "doubao") return false'), "Doubao image protocol must not claim reference support");

const openai = read("src/lib/providers/openai.js");
assert(openai.includes("Generic async response missing externalTaskId"), "generic async submit must require externalTaskId");
assert(openai.includes("Provider completed without an image"), "generic async completed responses without images must fail");
assert(!openai.includes("data.id || data.taskId || data.task_id || data.requestId"), "generic async must not guess task id fields");

console.log("stage-6-1 acceptance checks passed");
