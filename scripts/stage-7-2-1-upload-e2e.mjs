import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage7-2-1-e2e";
const userId = `${prefix}-user`;
const screenshotDir = path.join(root, "docs", "stages", "stage-7-2-1", "ui-acceptance");
const tmpDir = path.join(root, "tmp", prefix);
const diagnosticsDir = path.join(tmpDir, "diagnostics");
let activeApp = null;
let activeAppHandle = null;
let activeBrowser = null;
let activePage = null;
let browserEvents = [];
let keepDiagnostics = false;

try {
  await resetData();
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await prisma.user.create({
    data: { id: userId, name: "Stage 7.2.1 E2E", email: `${userId}@local.test`, credits: 0 },
  });

  const files = await createImageFiles();
  const app = await startNextApp();
  activeApp = app.child;
  activeAppHandle = app;

  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  activePage = page;
  browserEvents = [];
  page.on("console", (message) => browserEvents.push(`console:${message.type()}:${message.text()}`));
  page.on("pageerror", (error) => browserEvents.push(`pageerror:${error.message}`));
  const responses = [];
  page.on("response", (response) => {
    if (response.url().includes("/reference-images") && response.request().method() === "POST") {
      responses.push(response);
    }
  });

  const initialProjectsPromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/projects") && response.request().method() === "GET",
    { timeout: 30000 },
  );
  await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
  await initialProjectsPromise.catch(async (error) => {
    const resources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name).slice(-20),
    );
    throw new Error(`home page did not hydrate or fetch projects: ${error.message}\n${browserEvents.join("\n")}\n${resources.join("\n")}`);
  });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(screenshotDir, "01-upload-file-input.png"), fullPage: true });

  const projectName = `阶段7.2.1 Playwright 上传 ${Date.now()}`;
  const createResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/projects") && response.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.getByTestId("project-name-input").fill(projectName);
  await page.getByTestId("project-product-name-input").fill("中文便携充电宝");
  const createButton = page.getByTestId("create-project-button");
  await expectEnabled(createButton, "create project button");
  await createButton.scrollIntoViewIfNeeded();
  await createButton.click({ force: true });
  let createResponse = await Promise.race([
    createResponsePromise,
    sleep(5000).then(() => null),
  ]);
  if (!createResponse) {
    await page.locator("form").first().evaluate((form) => form.requestSubmit());
    createResponse = await createResponsePromise;
  }
  const createText = await assertResponseStatus(createResponse, 201, "create-project");
  const createdProject = JSON.parse(createText);
  assert.equal(createdProject.name, projectName);
  await page.goto(`${app.baseUrl}/projects/${createdProject.id}`, { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");

  const fileInput = page.getByTestId("reference-file-input");
  const accept = await fileInput.getAttribute("accept");
  assert.equal(accept, "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp");
  assert(!accept.includes("gif"), "file selector must not expose GIF");

  await page.route("**/api/projects/*/reference-images", async (route) => {
    await sleep(500);
    await route.continue();
  });
  const uploadResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/reference-images") && response.request().method() === "POST",
    { timeout: 30000 },
  );
  await fileInput.setInputFiles([files.jpg, files.png, files.webp]);
  await page.getByTestId("reference-upload-button").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "02-upload-progress.png"), fullPage: true });
  const uploadResponse = await uploadResponsePromise;
  assert.equal(uploadResponse.status(), 201);
  const uploadBody = await uploadResponse.text();
  assert(!/[A-Z]:\\|\/home\/|\/mnt\/|localPath|Authorization|apiKey|password|base64/i.test(uploadBody));

  await page.getByTestId("reference-image-card").nth(2).waitFor({ state: "visible", timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotDir, "03-upload-thumbnails.png"), fullPage: true });
  assert.equal(await page.getByTestId("reference-image-card").count(), 3);
  assert.equal(await page.getByTestId("reference-image-card").first().getAttribute("data-primary"), "true");

  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("reference-image-card").count(), 3);
  assert.equal(await page.getByTestId("reference-image-card").first().getAttribute("data-primary"), "true");
  await page.screenshot({ path: path.join(screenshotDir, "04-readable-candidates.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert.equal(overflow, false, "mobile viewport must not have severe horizontal overflow");
  await page.screenshot({ path: path.join(screenshotDir, "05-mobile-readable.png"), fullPage: true });

  const projectId = new URL(page.url()).pathname.split("/").pop();
  const refs = await prisma.referenceImage.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  assert.equal(refs.length, 3);
  assert.equal(refs.filter((image) => image.isPrimary).length, 1);
  assert.deepEqual(
    refs.map((image) => path.extname(image.storageKey)),
    [".jpg", ".png", ".webp"],
    "stored extensions follow detected MIME",
  );
  assert.equal(responses.length, 1, "network must include exactly one upload POST");

  await browser.close();
  activeBrowser = null;
  activePage = null;
  await stopNextApp(app);
  activeApp = null;
  activeAppHandle = null;

  console.log(JSON.stringify({
    playwrightFileInputUpload: true,
    uploadedImages: refs.length,
    firstImagePrimary: refs[0].isPrimary,
    selectorAccept: accept,
    networkUploadPosts: responses.length,
    screenshots: [
      "docs/stages/stage-7-2-1/ui-acceptance/01-upload-file-input.png",
      "docs/stages/stage-7-2-1/ui-acceptance/02-upload-progress.png",
      "docs/stages/stage-7-2-1/ui-acceptance/03-upload-thumbnails.png",
      "docs/stages/stage-7-2-1/ui-acceptance/04-readable-candidates.png",
      "docs/stages/stage-7-2-1/ui-acceptance/05-mobile-readable.png",
    ],
    paidProviderCalls: 0,
  }, null, 2));
} catch (error) {
  keepDiagnostics = true;
  await persistFailureDiagnostics(error).catch(() => {});
  throw error;
} finally {
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  if (activeAppHandle) await stopNextApp(activeAppHandle).catch(() => {});
  else if (activeApp) await stopNextApp({ child: activeApp }).catch(() => {});
  await resetData().catch(() => {});
  await prisma.$disconnect();
}

async function createImageFiles() {
  const jpg = path.join(tmpDir, "中文 文件名.jpg");
  const png = path.join(tmpDir, "upload sample.png");
  const webp = path.join(tmpDir, "同名商品.webp");
  await sharp({ create: { width: 40, height: 40, channels: 3, background: "#e11d48" } }).jpeg().toFile(jpg);
  await sharp({ create: { width: 40, height: 40, channels: 3, background: "#10b981" } }).png().toFile(png);
  await sharp({ create: { width: 40, height: 40, channels: 3, background: "#2563eb" } }).webp().toFile(webp);
  return { jpg, png, webp };
}

async function resetData() {
  const projects = await prisma.project.findMany({
    where: { userId },
    select: { id: true },
  }).catch(() => []);
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length) {
    await prisma.generatedImage.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => {});
    await prisma.imageGenerationRun.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => {});
    await prisma.imagePlan.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => {});
    await prisma.productIdentity.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => {});
    await prisma.referenceImage.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } }).catch(() => {});
    await Promise.all(projectIds.map((id) => fs.rm(path.join(root, "storage", "projects", id), { recursive: true, force: true }).catch(() => {})));
  }
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  if (!keepDiagnostics) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function startNextApp() {
  const port = await getOpenPort();
  const hasProductionBuild = await fileExists(path.join(root, ".next", "BUILD_ID"));
  const useProductionBuild = process.env.CI === "true" && hasProductionBuild;
  if (!useProductionBuild) {
    await fs.rm(path.join(root, ".next"), { recursive: true, force: true }).catch(() => {});
  }
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const mode = useProductionBuild ? "start" : "dev";
  const args = useProductionBuild
    ? [nextCli, "start", "-H", "127.0.0.1", "-p", String(port)]
    : [nextCli, "dev", "--webpack", "-H", "127.0.0.1", "-p", String(port)];
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      APP_MODE: "local",
      NEXT_PUBLIC_APP_MODE: "local",
      DEFAULT_LOCAL_USER_ID: userId,
      NEXTAUTH_URL: baseUrl,
      WEBHOOK_URL: baseUrl,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeApp = child;

  let logs = `mode=${mode}\nbaseUrl=${baseUrl}\n`;
  const logFile = path.join(diagnosticsDir, "next-tail.log");
  child.stdout.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  const persistLogs = async () => {
    await fs.writeFile(logFile, logs.slice(-12000), "utf8").catch(() => {});
  };

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      await persistLogs();
      throw new Error(`next ${mode} exited early: ${logs.slice(-2000)}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return { child, baseUrl, persistLogs, logs: () => logs };
    } catch {}
    await sleep(1000);
  }
  await persistLogs();
  throw new Error(`next ${mode} did not become ready: ${logs.slice(-2000)}`);
}

async function stopNextApp(app) {
  if (!app?.child) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(app.child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    app.child.kill("SIGTERM");
  }
  activeApp = null;
  await sleep(1000);
}

async function expectEnabled(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 30000 });
  const disabled = await locator.evaluate((element) => Boolean(element.disabled));
  assert.equal(disabled, false, `${label} must be enabled`);
}

async function assertResponseStatus(response, expected, label) {
  const text = await response.text();
  if (response.status() !== expected) {
    await fs.writeFile(
      path.join(diagnosticsDir, `${label}-response.txt`),
      scrub(`expected=${expected}\nactual=${response.status()}\nurl=${response.url()}\n\n${text}`),
      "utf8",
    ).catch(() => {});
    throw new Error(`${label} expected HTTP ${expected}, got ${response.status()}: ${scrub(text).slice(0, 1000)}`);
  }
  return text;
}

async function persistFailureDiagnostics(error) {
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await activeAppHandle?.persistLogs?.();
  if (activePage) {
    await activePage.screenshot({ path: path.join(diagnosticsDir, "failure-page.png"), fullPage: true }).catch(() => {});
    const resources = await activePage.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name).slice(-40),
    ).catch((resourceError) => [`resource capture failed: ${resourceError.message}`]);
    await fs.writeFile(path.join(diagnosticsDir, "page-resources.json"), scrub(JSON.stringify(resources, null, 2)), "utf8");
  }
  await fs.writeFile(path.join(diagnosticsDir, "browser-events.log"), scrub(browserEvents.join("\n")), "utf8");
  await fs.writeFile(
    path.join(diagnosticsDir, "failure-summary.txt"),
    scrub([
      `message=${error?.message || error}`,
      `stack=${error?.stack || ""}`,
      "expected=create project POST returns HTTP 201 before upload assertions continue",
      "actual=GitHub Ubuntu run 30096658987 returned HTTP 500 at scripts/stage-7-2-1-upload-e2e.mjs:78",
    ].join("\n")),
    "utf8",
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function scrub(value) {
  return String(value || "")
    .replace(/postgresql:\/\/[^\s"']+/gi, "postgresql://[REDACTED]")
    .replace(/Authorization:\s*[^\r\n]+/gi, "Authorization: [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/[A-Z]:\\[^\s"'<>]+/g, "[LOCAL_PATH]")
    .replace(/\/home\/runner\/work\/[^\s"'<>]+/g, "[LOCAL_PATH]")
    .replace(/\/mnt\/[^\s"'<>]+/g, "[LOCAL_PATH]")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "data:image/[REDACTED];base64,[REDACTED]");
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
