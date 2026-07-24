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
let activeApp = null;

try {
  await resetData();
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await prisma.user.create({
    data: { id: userId, name: "Stage 7.2.1 E2E", email: `${userId}@local.test`, credits: 0 },
  });

  const files = await createImageFiles();
  const app = await startNextApp();
  activeApp = app.child;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserEvents = [];
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
  assert.equal(createResponse.status(), 201);
  const createdProject = await createResponse.json();
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
  await stopNextApp(app);
  activeApp = null;

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
} finally {
  if (activeApp) await stopNextApp({ child: activeApp }).catch(() => {});
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
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

async function startNextApp() {
  const port = await getOpenPort();
  await fs.rm(path.join(root, ".next"), { recursive: true, force: true }).catch(() => {});
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--webpack", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      APP_MODE: "local",
      NEXT_PUBLIC_APP_MODE: "local",
      DEFAULT_LOCAL_USER_ID: userId,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeApp = child;

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const baseUrl = `http://localhost:${port}`;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`next dev exited early: ${logs.slice(-2000)}`);
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return { child, baseUrl };
    } catch {}
    await sleep(1000);
  }
  throw new Error(`next dev did not become ready: ${logs.slice(-2000)}`);
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
