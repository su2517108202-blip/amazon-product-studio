import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage8-0-2-local-usability";
const userId = `${prefix}-user`;
const tmpDir = path.join(root, "tmp", prefix);
const diagnosticsDir = path.join(tmpDir, "diagnostics");
const screenshotDir = path.join(root, "docs", "stages", "stage-8-0-2", "ui-acceptance");
const secretKey = crypto.randomBytes(32).toString("base64");
const fakeApiKey = "sk-stage-8-0-2-local-fake-key";
let prisma;
let fakeProvider;
let activeApp;
let activeBrowser;
let browserEvents = [];

process.env.APP_MODE = "local";
process.env.NEXT_PUBLIC_APP_MODE = "local";
process.env.DEFAULT_LOCAL_USER_ID = userId;
process.env.CREDENTIAL_ENCRYPTION_KEY = secretKey;
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.NEXTAUTH_SECRET = "stage-8-0-2-local-secret";
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.LINGTU_LOCAL_CONFIG_DIR = path.join(tmpDir, "config");

try {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  prisma = (await import("../src/lib/prisma.js")).prisma;
  await resetData();

  fakeProvider = await startFakeProvider();
  const app = await startNextApp();
  activeApp = app.child;

  await testConcurrentLocalUser(app.baseUrl);
  await testDraftModels(app.baseUrl);
  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
  page.on("console", (message) => browserEvents.push(`console:${message.type()}:${message.text()}`));
  page.on("pageerror", (error) => browserEvents.push(`pageerror:${error.message}`));
  page.on("dialog", (dialog) => dialog.accept());

  await testColdHome(page, app.baseUrl);
  await testProviderSettings(page, app.baseUrl);
  await testLocalStorageAndGallery(page, app.baseUrl);
  await testMobile(page, app.baseUrl);

  await fs.writeFile(
    path.join(root, "docs", "stages", "stage-8-0-2", "acceptance-summary.json"),
    JSON.stringify(
      {
        branch: "codex/stage-8-0-2-local-usability-fix",
        paidProviderCalls: 0,
        concurrentLocalUserCalls: 20,
        draftModelDiscovery: true,
        independentRoleAssignments: true,
        localGalleryWithoutLogin: true,
        customStorageWrite: true,
        storageMigration: true,
        mobileChecked: true,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("stage-8-0-2 local usability checks passed");
} catch (error) {
  await persistDiagnostics(error);
  throw error;
} finally {
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  if (activeApp) await stopNextApp({ child: activeApp }).catch(() => {});
  if (fakeProvider) await fakeProvider.close().catch(() => {});
  if (prisma) await prisma.$disconnect().catch(() => {});
}

async function testConcurrentLocalUser(baseUrl) {
  await prisma.user.deleteMany({ where: { id: userId } });
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => fetch(`${baseUrl}/api/projects`)),
  );
  const texts = await Promise.all(responses.map((response) => response.text()));
  if (!responses.every((response) => response.status === 200)) {
    await fs.writeFile(
      path.join(diagnosticsDir, "concurrent-local-user-responses.txt"),
      responses.map((response, index) => `${index + 1}: ${response.status}\n${texts[index].slice(0, 1000)}`).join("\n\n"),
      "utf8",
    );
  }
  assert(responses.every((response) => response.status === 200), "all concurrent local user requests must complete");
  assert(!texts.join("\n").match(/P2002|Unique constraint failed/i), "P2002 must not leak from concurrent local user requests");
  const count = await prisma.user.count({ where: { id: userId } });
  assert.equal(count, 1, "database keeps exactly one default local user");
}

async function testColdHome(page, baseUrl) {
  await prisma.user.deleteMany({ where: { id: userId } });
  const projects = page.waitForResponse((response) => response.url().endsWith("/api/projects"), { timeout: 30000 });
  const roles = page.waitForResponse((response) => response.url().includes("/api/model-role-assignments"), { timeout: 30000 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await Promise.all([projects, roles]);
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  assert(!/Unique constraint failed|P2002|数据库错误|Prisma/i.test(body), "cold home must not show database errors");
  await page.screenshot({ path: path.join(screenshotDir, "01-cold-home.png"), fullPage: true });
}

async function testDraftModels(baseUrl) {
  const discover = await jsonRequest(baseUrl, "/api/provider-models/discover", {
    method: "POST",
    body: {
      provider: "openai-compatible",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      protocol: "openai-compatible",
      timeoutMs: 5000,
      capabilities: ["text", "vision"],
    },
  });
  assert.equal(discover.status, 200, `draft discovery failed: ${discover.text}`);
  assert.deepEqual(discover.data.models, ["vision-a", "planner-b", "image-c"]);
  assert(!discover.text.includes(fakeApiKey), "draft discovery must not return API key");

  const test = await jsonRequest(baseUrl, "/api/provider-models/test", {
    method: "POST",
    body: {
      provider: "openai-compatible",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      protocol: "openai-compatible",
      modelId: "vision-a",
      capabilities: ["text", "vision"],
    },
  });
  assert.equal(test.status, 200, `draft test failed: ${test.text}`);
  assert(!test.text.includes(fakeApiKey), "draft connection test must not return API key");
}

async function testProviderSettings(page, baseUrl) {
  await page.goto(`${baseUrl}/settings/providers`, { waitUntil: "networkidle" });
  await page.getByText("服务商配置").first().waitFor({ state: "visible" });
  await page.getByLabel("配置名称").fill("草稿模型配置");
  await page.getByLabel("服务商").selectOption("openai-compatible");
  await page.getByLabel("Base URL").fill(fakeProvider.baseUrl);
  await page.getByLabel("API Key").fill(fakeApiKey);
  await page.getByText("获取模型").click();
  await page.getByPlaceholder("搜索模型").fill("planner");
  await page.getByLabel("模型 ID").selectOption("planner-b");
  assert.equal(await page.getByLabel("模型 ID").inputValue(), "planner-b");
  await page.getByRole("button", { name: "手动填写" }).click();
  await page.getByLabel("模型 ID").fill("manual-model-id");
  assert.equal(await page.getByLabel("模型 ID").inputValue(), "manual-model-id");
  await page.screenshot({ path: path.join(screenshotDir, "02-provider-draft-models.png"), fullPage: true });

  const profiles = await createThreeProviderProfiles(baseUrl);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("三角色绑定").waitFor({ state: "visible" });
  await selectRole(page, "商品识图", profiles.vision.id);
  await selectRole(page, "策划与提示词", profiles.planning.id);
  await selectRole(page, "图片生成", profiles.generation.id);

  let assignments = await getAssignments(baseUrl);
  assert.equal(assignments.product_vision, profiles.vision.id);
  assert.equal(assignments.image_planning, profiles.planning.id);
  assert.equal(assignments.image_generation, profiles.generation.id);

  await selectRole(page, "商品识图", profiles.altVision.id);
  assignments = await getAssignments(baseUrl);
  assert.equal(assignments.product_vision, profiles.altVision.id, "changed role updates");
  assert.equal(assignments.image_planning, profiles.planning.id, "planning role remains unchanged");
  assert.equal(assignments.image_generation, profiles.generation.id, "generation role remains unchanged");

  await page.reload({ waitUntil: "networkidle" });
  await expectRoleText(page, "商品识图", "OpenAI视觉备用");
  await expectRoleText(page, "策划与提示词", "DeepSeek策划");
  await expectRoleText(page, "图片生成", "Gemini生图");
  await page.screenshot({ path: path.join(screenshotDir, "03-independent-roles.png"), fullPage: true });
}

async function testLocalStorageAndGallery(page, baseUrl) {
  const fixture = await createGalleryFixture();
  const customRoot = path.join(tmpDir, "custom-storage");
  const oldStorage = path.join(root, "storage", "projects", fixture.projectId, "generations", fixture.runId);
  await fs.mkdir(oldStorage, { recursive: true });
  const oldFile = path.join(oldStorage, `${fixture.oldGeneratedId}.png`);
  await fs.writeFile(oldFile, await pngBuffer(80));

  await prisma.generatedImage.update({
    where: { id: fixture.oldGeneratedId },
    data: {
      storageKey: `projects/${fixture.projectId}/generations/${fixture.runId}/${fixture.oldGeneratedId}.png`,
      localPath: oldFile,
    },
  });

  const save = await jsonRequest(baseUrl, "/api/local-settings/storage", {
    method: "POST",
    body: { action: "save", storageRoot: customRoot, create: true },
  });
  assert.equal(save.status, 200, `custom storage save failed: ${save.text}`);

  const form = new FormData();
  form.append("files", new Blob([await pngBuffer(96)], { type: "image/png" }), "custom-reference.png");
  const upload = await fetch(`${baseUrl}/api/projects/${fixture.projectId}/reference-images`, {
    method: "POST",
    body: form,
  });
  const uploadText = await upload.text();
  assert.equal(upload.status, 201, `custom storage upload failed: ${uploadText}`);
  const uploaded = JSON.parse(uploadText)[0];
  const uploadedRow = await prisma.referenceImage.findUnique({ where: { id: uploaded.id } });
  assert(uploadedRow.localPath.startsWith(customRoot), "new files must write to custom storage root");

  const preview = await jsonRequest(baseUrl, "/api/local-settings/storage/migrate", {
    method: "POST",
    body: { storageRoot: customRoot, create: true, confirm: false },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.requiresConfirmation, true, "migration must require confirmation");
  const migrate = await jsonRequest(baseUrl, "/api/local-settings/storage/migrate", {
    method: "POST",
    body: { storageRoot: customRoot, create: true, confirm: true },
  });
  assert.equal(migrate.status, 200, `migration failed: ${migrate.text}`);
  assert.equal(await fileExists(oldFile), true, "migration must not delete old directory files");

  const oldDownload = await fetch(`${baseUrl}/api/storage/projects/${fixture.projectId}/generations/${fixture.runId}/${fixture.oldGeneratedId}.png`);
  assert.equal(oldDownload.status, 200, "old file remains accessible after path switch");

  await page.goto(`${baseUrl}/gallery`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "本地素材库" }).waitFor({ state: "visible" });
  const body = await page.locator("body").innerText();
  assert(!body.includes("需要登录"), "local gallery must not require login");
  assert(!body.includes("Google"), "local gallery must not show Google login");
  assert(body.includes("全部生成图"), "local gallery shows generated section");
  assert(body.includes("首选图"), "local gallery shows preferred section");
  assert(body.includes("参考图"), "local gallery shows reference section");
  assert(body.includes("图1"), "gallery reads ImagePlan and GeneratedImage records");
  await page.screenshot({ path: path.join(screenshotDir, "04-local-gallery.png"), fullPage: true });
}

async function testMobile(page, baseUrl) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/settings/providers`, { waitUntil: "networkidle" });
  const settingsOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert.equal(settingsOverflow, false, "provider settings must not severely overflow on mobile");
  await page.screenshot({ path: path.join(screenshotDir, "05-settings-mobile.png"), fullPage: true });
  await page.goto(`${baseUrl}/gallery`, { waitUntil: "networkidle" });
  const galleryOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert.equal(galleryOverflow, false, "gallery must not severely overflow on mobile");
  await page.screenshot({ path: path.join(screenshotDir, "06-gallery-mobile.png"), fullPage: true });
}

async function createThreeProviderProfiles(baseUrl) {
  const payloads = {
    vision: {
      name: "OpenAI视觉",
      provider: "openai-compatible",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      modelId: "vision-a",
      protocol: "openai-compatible",
      capabilities: ["text", "vision"],
    },
    altVision: {
      name: "OpenAI视觉备用",
      provider: "openai-compatible",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      modelId: "vision-alt",
      protocol: "openai-compatible",
      capabilities: ["text", "vision"],
    },
    planning: {
      name: "DeepSeek策划",
      provider: "deepseek",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      modelId: "planner-b",
      protocol: "openai-compatible",
      capabilities: ["text", "reasoning"],
    },
    generation: {
      name: "Gemini生图",
      provider: "gemini",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      modelId: "models/image-c",
      protocol: "gemini-native-image",
      capabilities: ["text", "vision", "image"],
    },
  };

  const created = {};
  for (const [key, body] of Object.entries(payloads)) {
    const response = await jsonRequest(baseUrl, "/api/provider-profiles", { method: "POST", body });
    assert.equal(response.status, 201, `profile ${body.name} must be created: ${response.text}`);
    created[key] = response.data;
  }
  return created;
}

async function selectRole(page, roleLabel, profileId) {
  const roleCard = page.locator("article").filter({ hasText: roleLabel }).last();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/model-role-assignments/") &&
      response.request().method() === "PUT",
    { timeout: 10000 },
  );
  await roleCard.locator("select").selectOption(profileId);
  const response = await responsePromise;
  const text = await response.text();
  assert.equal(response.status(), 200, `role ${roleLabel} binding failed: ${text}`);
}

async function expectRoleText(page, roleLabel, expected) {
  const roleCard = page.locator("article").filter({ hasText: roleLabel }).last();
  await roleCard.locator("p").first().getByText(expected, { exact: false }).waitFor({ state: "visible" });
}

async function getAssignments(baseUrl) {
  const response = await jsonRequest(baseUrl, "/api/model-role-assignments");
  assert.equal(response.status, 200);
  return Object.fromEntries(response.data.map((item) => [item.role, item.providerProfileId]));
}

async function createGalleryFixture() {
  const projectId = `${prefix}-project`;
  const planId = `${prefix}-plan-1`;
  const runId = `${prefix}-run-1`;
  const referenceId = `${prefix}-reference-1`;
  const oldGeneratedId = `${prefix}-generated-old`;
  await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      userId,
      name: "本地素材库项目",
      productName: "测试产品",
      platform: "Amazon",
      aspectRatio: "1:1",
    },
  });
  const referenceDir = path.join(root, "storage", "projects", projectId, "references");
  await fs.mkdir(referenceDir, { recursive: true });
  const referencePath = path.join(referenceDir, "reference.png");
  await fs.writeFile(referencePath, await pngBuffer(64));
  await prisma.referenceImage.upsert({
    where: { id: referenceId },
    update: {},
    create: {
      id: referenceId,
      projectId,
      url: `/api/storage/projects/${projectId}/references/reference.png`,
      localPath: referencePath,
      storageKey: `projects/${projectId}/references/reference.png`,
      fileName: "reference.png",
      mimeType: "image/png",
      sortOrder: 0,
      isPrimary: true,
      includeInAnalysis: true,
      includeInGeneration: true,
      imageRole: "front",
    },
  });
  await prisma.imagePlan.upsert({
    where: { projectId_planIndex: { projectId, planIndex: 1 } },
    update: {},
    create: {
      id: planId,
      projectId,
      planIndex: 1,
      taskType: "主图",
      coreSellingPoint: "卖点",
      scene: "白底",
      composition: "居中",
      keyNotesJson: "[]",
      mustKeepJson: "[]",
      avoidJson: "[]",
      finalPrompt: "生成主图",
    },
  });
  await prisma.imageGenerationRun.upsert({
    where: { id: runId },
    update: {},
    create: {
      id: runId,
      projectId,
      imagePlanId: planId,
      provider: "fake",
      model: "image-c",
      protocol: "gemini-native-image",
      status: "completed",
      promptSnapshot: "fixture",
      completedAt: new Date(),
    },
  });
  await prisma.generatedImage.upsert({
    where: { id: oldGeneratedId },
    update: {},
    create: {
      id: oldGeneratedId,
      projectId,
      imagePlanId: planId,
      generationRunId: runId,
      outputIndex: 0,
      storageKey: `projects/${projectId}/generations/${runId}/${oldGeneratedId}.png`,
      mimeType: "image/png",
      width: 80,
      height: 80,
      byteSize: 1,
      sha256: "old",
      sourceType: "base64",
    },
  });
  await prisma.imagePlan.update({
    where: { id: planId },
    data: { preferredGeneratedImageId: oldGeneratedId },
  });
  return { projectId, planId, runId, oldGeneratedId };
}

async function resetData() {
  await prisma.modelRoleAssignment.deleteMany({ where: { userId } });
  await prisma.providerProfile.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function jsonRequest(baseUrl, pathname, { method = "GET", body } = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (response.status === 500 && isNextDevManifestError(text) && attempt < 3) {
      await sleep(1000);
      continue;
    }
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {}
    return { status: response.status, data, text };
  }
}

function isNextDevManifestError(text) {
  return text.includes("Manifest file is empty") ||
    (text.includes("loadManifest") && text.includes("Unexpected end of JSON input"));
}

async function startFakeProvider() {
  const server = http.createServer(async (req, res) => {
    await readRequestBody(req);
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/models") {
      res.end(JSON.stringify({
        data: [{ id: "vision-a" }, { id: "planner-b" }, { id: "image-c" }],
        models: [{ name: "models/image-c" }],
      }));
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/models/")) {
      res.end(JSON.stringify({ id: decodeURIComponent(req.url.split("/").pop() || "model") }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function startNextApp() {
  const port = await getFreePort();
  await fs.rm(path.join(root, ".next"), { recursive: true, force: true }).catch(() => {});
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [nextCli, "dev", "--webpack", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, NEXTAUTH_URL: baseUrl, WEBHOOK_URL: baseUrl, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = `baseUrl=${baseUrl}\n`;
  child.stdout.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  const persistLogs = async () => {
    await fs.writeFile(path.join(diagnosticsDir, "next-tail.log"), logs.slice(-12000), "utf8").catch(() => {});
  };
  for (let i = 0; i < 90; i += 1) {
    if (child.exitCode != null) {
      await persistLogs();
      throw new Error(`Next exited early with ${child.exitCode}: ${logs.slice(-2000)}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return { child, baseUrl, persistLogs };
    } catch {}
    await sleep(1000);
  }
  await persistLogs();
  throw new Error(`Next app did not start: ${logs.slice(-2000)}`);
}

async function stopNextApp(app) {
  if (!app?.child || app.child.exitCode != null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(app.child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    app.child.kill("SIGTERM");
  }
  await sleep(1000);
  if (app.child.exitCode == null) app.child.kill("SIGKILL");
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function pngBuffer(size) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 80, g: 120, b: 220, alpha: 1 },
    },
  }).png().toBuffer();
}

async function fileExists(filePath) {
  return Boolean(await fs.stat(filePath).catch(() => null));
}

async function persistDiagnostics(error) {
  await fs.mkdir(diagnosticsDir, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(diagnosticsDir, "failure-summary.txt"), String(error?.stack || error), "utf8").catch(() => {});
  await fs.writeFile(path.join(diagnosticsDir, "browser-events.log"), browserEvents.join("\n"), "utf8").catch(() => {});
}

function scrub(text) {
  return String(text || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[REDACTED]")
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, "[USER_PATH]");
}
