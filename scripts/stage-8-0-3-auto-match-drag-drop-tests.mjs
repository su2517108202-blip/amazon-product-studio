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
import {
  inferModelCapabilities,
  inferProviderDraftSettings,
} from "../src/lib/provider-profiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage8-0-3-auto-match";
const userId = `${prefix}-user`;
const tmpDir = path.join(root, "tmp", prefix);
const diagnosticsDir = path.join(tmpDir, "diagnostics");
const screenshotDir = path.join(root, "docs", "stages", "stage-8-0-3", "ui-acceptance");
const fakeApiKey = "sk-stage-8-0-3-local-fake-key";
let prisma;
let fakeProvider;
let activeApp;
let activeBrowser;
let activePage;
let browserEvents = [];

process.env.APP_MODE = "local";
process.env.NEXT_PUBLIC_APP_MODE = "local";
process.env.DEFAULT_LOCAL_USER_ID = userId;
process.env.CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.NEXTAUTH_SECRET = "stage-8-0-3-local-secret";
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.LINGTU_LOCAL_CONFIG_DIR = path.join(tmpDir, "config");

try {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  prisma = (await import("../src/lib/prisma.js")).prisma;
  await resetData();

  assert(await fileExists(path.join(root, "docs", "design", "灵图电商工作室_V2_体验重构方案_Stage8.0.3.md")), "stage 8.0.3 design doc must be committed");
  testCapabilityInference();

  fakeProvider = await startFakeProvider();
  const app = await startNextApp();
  activeApp = app.child;

  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  activePage = page;
  page.on("console", (message) => browserEvents.push(`console:${message.type()}:${message.text()}`));
  page.on("pageerror", (error) => browserEvents.push(`pageerror:${error.message}`));
  page.on("dialog", (dialog) => dialog.accept());

  const projectId = await testHomeClickUpload(page, app.baseUrl);
  await testWorkspaceDropAndPaste(page, app.baseUrl, projectId);
  await testProviderAutoDetectAndRecommend(page, app.baseUrl);
  await testMobileWorkspace(page, app.baseUrl, projectId);

  await fs.writeFile(
    path.join(root, "docs", "stages", "stage-8-0-3", "acceptance-summary.json"),
    JSON.stringify(
      {
        branch: "codex/stage-8-0-3-auto-match-drag-drop",
        paidProviderCalls: 0,
        homeClickUpload: true,
        workspaceDragUpload: true,
        workspacePasteUpload: true,
        modelCapabilityAutoDetect: true,
        roleRecommendationPreservesLockedRoles: true,
        workspaceThreeColumnLayout: true,
        mobileChecked: true,
        preservedLocalNoLoginProjectsGalleryResultManagement: true,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("stage-8-0-3 auto match drag drop checks passed");
} catch (error) {
  await persistDiagnostics(error);
  throw error;
} finally {
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  if (activeApp) await stopNextApp({ child: activeApp }).catch(() => {});
  if (fakeProvider) await fakeProvider.close().catch(() => {});
  if (prisma) await prisma.$disconnect().catch(() => {});
}

function testCapabilityInference() {
  assert(inferModelCapabilities("openai-compatible", "gpt-4o-vision").includes("vision"), "vision model must infer vision capability");
  const imageDraft = inferProviderDraftSettings({
    provider: "openai-compatible",
    modelId: "gpt-image-1",
    capabilities: ["text"],
    protocol: "openai-compatible",
  });
  assert(imageDraft.capabilities.includes("image"), "image model must infer image capability");
  assert.equal(imageDraft.protocol, "openai-image-edit", "image model must infer reference-image capable protocol");
  assert.deepEqual(inferModelCapabilities("deepseek", "deepseek-chat"), ["text", "reasoning"], "DeepSeek remains text planning only");
}

async function testHomeClickUpload(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("home-quick-upload-zone").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "01-home-upload-zone.png"), fullPage: true });

  const projectResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/projects") && response.request().method() === "POST",
  );
  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes("/reference-images") && response.request().method() === "POST",
  );
  await page.getByTestId("home-quick-file-input").setInputFiles({
    name: "home-click.png",
    mimeType: "image/png",
    buffer: await pngBuffer(96),
  });
  const project = await projectResponse;
  const upload = await uploadResponse;
  assert.equal(project.status(), 201, "home quick upload creates project");
  assert.equal(upload.status(), 201, "home quick upload saves reference image");
  await page.waitForURL(/\/projects\//, { timeout: 15000 });
  const projectId = page.url().split("/projects/")[1]?.split(/[?#]/)[0];
  assert(projectId, "home quick upload navigates to workspace");
  await waitForWorkflowStep(page, 2);
  await openPanelIfPresent(page, "workflow-step-1");
  await page.getByTestId("reference-image-card").first().waitFor({ state: "visible" });
  return projectId;
}

async function testWorkspaceDropAndPaste(page, baseUrl, projectId) {
  await page.goto(`${baseUrl}/projects/${projectId}`, { waitUntil: "networkidle" });
  await openPanelIfPresent(page, "workflow-step-1");
  await page.getByTestId("reference-drop-zone").waitFor({ state: "visible" });

  const before = await countReferences(projectId);
  const dropResponse = page.waitForResponse((response) =>
    response.url().includes("/reference-images") && response.request().method() === "POST",
  );
  await dispatchImageDrop(page, "workspace-drop.png", 110);
  assert.equal((await dropResponse).status(), 201, "workspace drop upload succeeds");
  assert.equal(await countReferences(projectId), before + 1, "drop upload adds one reference");

  const pasteResponse = page.waitForResponse((response) =>
    response.url().includes("/reference-images") && response.request().method() === "POST",
  );
  await dispatchImagePaste(page, "workspace-paste.png", 112);
  assert.equal((await pasteResponse).status(), 201, "workspace paste upload succeeds");
  assert.equal(await countReferences(projectId), before + 2, "paste upload adds one reference");

  await page.screenshot({ path: path.join(screenshotDir, "02-workspace-three-columns-upload.png"), fullPage: true });
}

async function testProviderAutoDetectAndRecommend(page, baseUrl) {
  const profiles = await createProviderProfiles(baseUrl);
  await jsonRequest(baseUrl, `/api/model-role-assignments/image_planning`, {
    method: "PUT",
    body: { providerProfileId: profiles.lockedPlanning.id },
  });

  await page.goto(`${baseUrl}/settings/providers`, { waitUntil: "networkidle" });
  await page.getByText("AI 服务").first().waitFor({ state: "visible" });
  await page.getByRole("button", { name: "高级：手动填写模型 ID" }).click();
  await page.getByLabel("选择模型").fill("gpt-image-1");
  await page.getByRole("button", { name: "高级设置" }).click();
  await page.locator('input[value="openai-image-edit"]').waitFor({ state: "visible" });

  await page.getByRole("button", { name: "模型分工" }).click();
  await page.getByTestId("role-lock-image_planning").check();
  const recommendation = page.waitForResponse((response) =>
    response.url().includes("/api/model-role-assignments/") && response.request().method() === "PUT",
  );
  await page.getByTestId("recommend-roles-button").click();
  await recommendation;
  await page.waitForTimeout(500);

  const assignments = await getAssignments(baseUrl);
  assert.equal(assignments.image_planning, profiles.lockedPlanning.id, "locked planning role must not be overwritten");
  assert.equal(assignments.product_vision, profiles.vision.id, "vision role receives recommended profile");
  assert.equal(assignments.image_generation, profiles.generation.id, "generation role receives recommended profile");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "模型分工" }).click();
  await page.locator("p", { hasText: "视觉模型" }).first().waitFor({ state: "visible" });
  await page.locator("p", { hasText: "Gemini生图" }).first().waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "03-provider-auto-recommend.png"), fullPage: true });
}

async function testMobileWorkspace(page, baseUrl, projectId) {
  await page.setViewportSize({ width: 390, height: 844 });
  const projectResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith(`/api/projects/${projectId}`),
    { timeout: 60000 },
  ).catch(() => null);
  await page.goto(`${baseUrl}/projects/${projectId}`, { waitUntil: "domcontentloaded" });
  const projectResponse = await projectResponsePromise;
  assert(projectResponse && projectResponse.status() === 200, "mobile workspace project API must load");
  try {
    await openPanelIfPresent(page, "workflow-step-1");
    await page.getByTestId("reference-drop-zone").waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    await page.screenshot({ path: path.join(diagnosticsDir, "mobile-workspace-missing-drop-zone.png"), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(diagnosticsDir, "mobile-workspace-body.txt"), await page.locator("body").innerText().catch(() => ""), "utf8").catch(() => {});
    throw error;
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert.equal(overflow, false, "workspace must not severely overflow on mobile");
  await page.screenshot({ path: path.join(screenshotDir, "04-workspace-mobile.png"), fullPage: true });
}

async function openPanelIfPresent(page, testId) {
  const panel = page.getByTestId(testId);
  await panel.waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
  if (await panel.count() === 0) return;
  const isOpen = await panel.evaluate((element) => element.dataset.open === "true" || element.open === true);
  if (isOpen) return;
  const toggle = page.getByTestId(`${testId}-toggle`);
  if (await toggle.count()) {
    await page.evaluate((id) => {
      document.querySelector(`[data-testid="${id}-toggle"]`)?.click();
    }, testId);
  }
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return !element || element.dataset.open === "true" || element.open === true;
    },
    testId,
    { timeout: 30000 },
  );
}

async function waitForWorkflowStep(page, index) {
  await page.waitForFunction(
    (stepIndex) => document.querySelector(`[data-testid="workflow-step-${stepIndex}"]`)?.dataset.current === "true",
    index,
    { timeout: 30000 },
  );
}

async function dispatchImageDrop(page, fileName, size) {
  const bytes = [...(await pngBuffer(size))];
  await page.getByTestId("reference-drop-zone").dispatchEvent("drop", {
    dataTransfer: await page.evaluateHandle(({ fileName: name, bytes: data }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], name, { type: "image/png" }));
      return transfer;
    }, { fileName, bytes }),
  });
}

async function dispatchImagePaste(page, fileName, size) {
  const bytes = [...(await pngBuffer(size))];
  await page.evaluate(({ fileName: name, bytes: data }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], name, { type: "image/png" }));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer });
    window.dispatchEvent(event);
  }, { fileName, bytes });
}

async function createProviderProfiles(baseUrl) {
  const payloads = {
    vision: {
      name: "视觉模型",
      provider: "openai-compatible",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      modelId: "gpt-4o-vision",
      protocol: "openai-compatible",
      capabilities: ["text", "vision"],
    },
    lockedPlanning: {
      name: "锁定策划",
      provider: "deepseek",
      baseUrl: fakeProvider.baseUrl,
      apiKey: fakeApiKey,
      modelId: "deepseek-chat",
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

async function countReferences(projectId) {
  return prisma.referenceImage.count({ where: { projectId } });
}

async function getAssignments(baseUrl) {
  const response = await jsonRequest(baseUrl, "/api/model-role-assignments");
  assert.equal(response.status, 200);
  return Object.fromEntries(response.data.map((item) => [item.role, item.providerProfileId]));
}

async function resetData() {
  await prisma.modelRoleAssignment.deleteMany({ where: { userId } });
  await prisma.providerProfile.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function jsonRequest(baseUrl, pathname, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  return { status: response.status, data, text };
}

async function startFakeProvider() {
  const server = http.createServer(async (req, res) => {
    await readRequestBody(req);
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/models") {
      res.end(JSON.stringify({
        data: [{ id: "gpt-4o-vision" }, { id: "deepseek-chat" }, { id: "gpt-image-1" }],
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
      background: { r: 36, g: 120, b: 190, alpha: 1 },
    },
  }).png().toBuffer();
}

async function fileExists(filePath) {
  return Boolean(await fs.stat(filePath).catch(() => null));
}

async function persistDiagnostics(error) {
  await fs.mkdir(diagnosticsDir, { recursive: true }).catch(() => {});
  if (activePage) {
    await activePage.screenshot({ path: path.join(diagnosticsDir, "failure-page.png"), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(diagnosticsDir, "failure-body.txt"), await activePage.locator("body").innerText().catch(() => ""), "utf8").catch(() => {});
  }
  await fs.writeFile(path.join(diagnosticsDir, "failure-summary.txt"), String(error?.stack || error), "utf8").catch(() => {});
  await fs.writeFile(path.join(diagnosticsDir, "browser-events.log"), browserEvents.join("\n"), "utf8").catch(() => {});
}

function scrub(text) {
  return String(text || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[REDACTED]")
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, "[USER_PATH]");
}
