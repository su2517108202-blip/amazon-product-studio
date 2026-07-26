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
import { Client } from "pg";
import { chromium } from "playwright";
import sharp from "sharp";

process.on("uncaughtException", (error) => {
  if (suppressExpectedDisconnectErrors && isExpectedDisconnectError(error)) return;
  throw error;
});
process.on("unhandledRejection", (error) => {
  if (suppressExpectedDisconnectErrors && isExpectedDisconnectError(error)) return;
  throw error;
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage8-final-e2e";
const userId = `${prefix}-user`;
const screenshotDir = path.join(root, "docs", "stages", "stage-8", "ui-acceptance");
const tmpDir = path.join(root, "tmp", prefix);
const diagnosticsDir = path.join(tmpDir, "diagnostics");
const secretKey = crypto.randomBytes(32).toString("base64");
const fakeApiKey = "sk-stage8-local-fake-key";
let tempDb = null;
let activeApp = null;
let activeAppHandle = null;
let activeBrowser = null;
let activePage = null;
let fakeProvider = null;
let prisma = null;
let suppressExpectedDisconnectErrors = false;
let browserEvents = [];

const providerRecords = {
  analysisRequests: [],
  planningRequests: [],
  generationRequests: [],
};

try {
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(diagnosticsDir, { recursive: true });
  tempDb = await createEphemeralDatabase();
  process.env.DATABASE_URL = tempDb.url;
  process.env.DIRECT_URL = tempDb.url;
  process.env.APP_MODE = "local";
  process.env.NEXT_PUBLIC_APP_MODE = "local";
  process.env.DEFAULT_LOCAL_USER_ID = userId;
  process.env.CREDENTIAL_ENCRYPTION_KEY = secretKey;
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  process.env.NEXTAUTH_SECRET = "stage-8-local-test-secret";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  if (tempDb.pglite) {
    process.env.DATABASE_POOL_MAX = "1";
  }

  await runCommand("npx", ["prisma", "generate"], { env: process.env });
  if (tempDb.pglite) {
    await applySqlMigrations(tempDb.url);
  } else {
    await runCommand("npx", ["prisma", "migrate", "deploy"], { env: process.env });
  }

  const doctor = await runNodeCapture(["scripts/doctor-local.mjs"], {
    env: process.env,
    timeoutMs: 30000,
  });
  await renderTextPng(
    path.join(screenshotDir, "10-startup-doctor.png"),
    `doctor-local\n\n${doctor.stdout || ""}${doctor.stderr || ""}`,
  );
  assert.equal(doctor.status, 0, "doctor-local must pass");

  fakeProvider = await startFakeProvider();
  prisma = (await import("../src/lib/prisma.js")).prisma;
  await seedLocalProvider(fakeProvider.baseUrl);
  await prisma.$disconnect();
  prisma = null;
  const files = await createImageFiles();

  const app = await startNextApp();
  activeApp = app.child;
  activeAppHandle = app;
  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  activePage = page;
  page.on("dialog", (dialog) => dialog.accept());
  browserEvents = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserEvents.push(`console:${message.type()}:${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserEvents.push(`pageerror:${error.message}`));

  await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
  await openDetailsIfPresent(page, "home-more-settings");
  await page.getByTestId("project-name-input").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: path.join(screenshotDir, "01-home-final.png"), fullPage: true });

  const projectName = `阶段8 最终验收 ${Date.now()}`;
  const createResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/projects") && response.request().method() === "POST",
    { timeout: 30000 },
  ).catch((error) => error);
  await page.getByTestId("project-name-input").fill(projectName);
  await page.getByTestId("project-product-name-input").fill("中文便携保温杯");
  await page.getByTestId("create-project-button").click({ force: true });
  let createResponse = await Promise.race([
    createResponsePromise,
    sleep(5000).then(() => null),
  ]);
  if (!createResponse) {
    const fallbackCreateResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/projects") && response.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.locator("form").first().evaluate((form) => form.requestSubmit());
    createResponse = await fallbackCreateResponsePromise.catch(async (error) => {
      await app.persistLogs?.();
      await page.screenshot({ path: path.join(screenshotDir, "create-project-timeout.png"), fullPage: true }).catch(() => {});
      await fs.writeFile(path.join(tmpDir, "browser-events.log"), browserEvents.join("\n"), "utf8").catch(() => {});
      throw error;
    });
  }
  if (createResponse instanceof Error) throw createResponse;
  const createText = await createResponse.text();
  if (createResponse.status() !== 201) {
    await app.persistLogs?.();
    throw new Error(`create project failed ${createResponse.status()}: ${createText}`);
  }
  await fs.writeFile(path.join(tmpDir, "created-project.json"), createText, "utf8");
  const createdProject = JSON.parse(createText);
  assert(createdProject.id, `created project response must include id: ${createText}`);
  await page.screenshot({ path: path.join(screenshotDir, "02-create-project.png"), fullPage: true });

  const projectGetPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/projects/${createdProject.id}`) &&
      response.request().method() === "GET",
    { timeout: 30000 },
  );
  await page.goto(`${app.baseUrl}/projects/${createdProject.id}`, { waitUntil: "domcontentloaded" });
  const projectGet = await projectGetPromise;
  if (projectGet.status() !== 200) {
    throw new Error(`project detail failed ${projectGet.status()}: ${await projectGet.text()}`);
  }
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await fs.writeFile(path.join(tmpDir, "project-page-url.txt"), page.url(), "utf8");
  await app.persistLogs?.();
  await page.screenshot({ path: path.join(screenshotDir, "project-load-debug.png"), fullPage: true });
  const referenceUploadResponse = page.waitForResponse(
    (response) => response.url().includes("/reference-images") && response.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.getByTestId("reference-file-input").setInputFiles([files.jpg, files.png, files.webp]);
  const referenceUpload = await referenceUploadResponse;
  if (referenceUpload.status() !== 201) {
    throw new Error(`reference upload failed ${referenceUpload.status()}: ${await referenceUpload.text()}`);
  }
  await waitForWorkflowStep(page, 2);
  await openDetailsIfPresent(page, "workflow-step-1");
  await page.getByTestId("reference-image-card").nth(2).waitFor({ state: "visible", timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotDir, "03-reference-upload.png"), fullPage: true });
  assert.equal(await page.getByTestId("reference-image-card").count(), 3);
  assert.equal(await page.getByTestId("reference-image-card").first().getAttribute("data-primary"), "true");

  const analyzeResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith(`/api/projects/${createdProject.id}/analyze`) && response.request().method() === "POST",
    { timeout: 30000 },
  );
  await openDetailsIfPresent(page, "workflow-step-2");
  await page.getByTestId("analyze-product-button").click();
  const analyzeResponse = await analyzeResponsePromise;
  if (analyzeResponse.status() !== 200) {
    throw new Error(`analyze failed ${analyzeResponse.status()}: ${await analyzeResponse.text()}`);
  }
  await page.reload({ waitUntil: "networkidle" });
  await openDetailsIfPresent(page, "workflow-step-3");
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="generate-plans-button"]');
    return button && !button.disabled;
  }, null, { timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotDir, "04-product-identity.png"), fullPage: true });
  assert.equal(providerRecords.analysisRequests.length, 1);
  assert.equal(providerRecords.analysisRequests[0].imageCount, 3);

  const planningResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/projects/${createdProject.id}/image-plans/generate`) &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );
  await openDetailsIfPresent(page, "workflow-step-3");
  await page.getByTestId("generate-plans-button").click();
  const planningResponse = await planningResponsePromise;
  const planningData = await planningResponse.json();
  if (planningResponse.status() !== 200) {
    throw new Error(`planning failed ${planningResponse.status()}: ${JSON.stringify(planningData)}`);
  }
  const persistedPlans = planningData.plans || [];
  assert.equal(persistedPlans.length, 5);
  const planIdsByIndex = new Map(persistedPlans.map((plan) => [plan.planIndex, plan.id]));
  await waitForWorkflowStep(page, 4);
  await openDetailsIfPresent(page, "workflow-step-3");
  await page.getByTestId("plan-tab-5").waitFor({ state: "visible", timeout: 30000 });
  await openDetailsIfPresent(page, "workflow-step-3");
  await selectPlanTab(page, 5);
  await selectPlanTab(page, 1);
  await openDetailsIfPresent(page, "workflow-step-3");
  await openDetailsIfPresent(page, "planning-advanced-editor");
  await waitForPlanButtonReady(page, "save-plan-button", planIdsByIndex.get(1));
  await page.getByLabel("核心卖点", { exact: true }).fill("一眼看清杯身与便携握持");
  const savePlanResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/image-plans/") && response.request().method() === "PATCH",
    { timeout: 30000 },
  );
  await page.getByTestId("save-plan-button").click();
  const savePlanResponse = await savePlanResponsePromise;
  if (savePlanResponse.status() !== 200) {
    throw new Error(`save plan failed ${savePlanResponse.status()}: ${await savePlanResponse.text()}`);
  }
  await page.screenshot({ path: path.join(screenshotDir, "05-five-plans.png"), fullPage: true });
  assert.equal(providerRecords.planningRequests.length, 1);
  assert.equal(providerRecords.planningRequests[0].identityProductName, "中文便携保温杯");

  for (let index = 1; index <= 5; index += 1) {
    const expectedPlanId = planIdsByIndex.get(index);
    await selectPlanTab(page, index, { projectId: createdProject.id, planId: expectedPlanId });
    console.log(`生成图 ${index}/5：${expectedPlanId}`);
    await waitForPlanButtonReady(page, "generate-current-image-button", expectedPlanId);
    const expectedGenerationCount = providerRecords.generationRequests.length + 1;
    await postGenerationFromPage(page, createdProject.id, expectedPlanId);
    await waitForProviderGenerationCount(expectedGenerationCount);
    await page.reload({ waitUntil: "networkidle" });
    await openDetailsIfPresent(page, "workflow-step-3");
    await openDetailsIfPresent(page, "workflow-step-4");
    await openDetailsIfPresent(page, "generation-history-details");
    await selectPlanTab(page, index, { projectId: createdProject.id, planId: expectedPlanId });
    await openDetailsIfPresent(page, "workflow-step-4");
    await openDetailsIfPresent(page, "generation-history-details");
    await page.getByTestId("candidate-card").first().waitFor({ state: "visible", timeout: 30000 });
  }
  assert.equal(providerRecords.generationRequests.length, 5);
  await fs.writeFile(path.join(tmpDir, "provider-records.json"), JSON.stringify(providerRecords, null, 2), "utf8");
  assert(providerRecords.generationRequests.every((item) => item.referenceImageCount >= 1));
  await page.screenshot({ path: path.join(screenshotDir, "06-generation-candidate.png"), fullPage: true });

  await selectPlanTab(page, 1);
  await openDetailsIfPresent(page, "workflow-step-4");
  await openDetailsIfPresent(page, "generation-history-details");
  await waitForPlanButtonReady(page, "force-generate-current-image-button", planIdsByIndex.get(1));
  await getPlanButton(page, "force-generate-current-image-button", planIdsByIndex.get(1)).click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="candidate-card"]').length === 2,
    null,
    { timeout: 30000 },
  );

  for (let index = 1; index <= 5; index += 1) {
    await openDetailsIfPresent(page, "workflow-step-3");
    await openDetailsIfPresent(page, "workflow-step-4");
    await openDetailsIfPresent(page, "generation-history-details");
    await selectPlanTab(page, index);
    await openDetailsIfPresent(page, "workflow-step-4");
    await openDetailsIfPresent(page, "generation-history-details");
    await page.getByTestId("candidate-card").first().waitFor({ state: "visible", timeout: 30000 });
    await waitForPlanButtonReady(page, "set-preferred-candidate-button", planIdsByIndex.get(index));
    const preferredButton = getPlanButton(page, "set-preferred-candidate-button", planIdsByIndex.get(index)).first();
    if ((await preferredButton.textContent()).includes("设为首选")) {
      console.log(`设置首选图 ${index}/5：${planIdsByIndex.get(index)}`);
      const preferredResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${createdProject.id}/image-plans/`) &&
          response.url().endsWith("/preferred-image") &&
          response.request().method() === "PATCH",
        { timeout: 30000 },
      );
      await preferredButton.click();
      const preferredResponse = await preferredResponsePromise;
      if (!preferredResponse.url().includes(`/api/projects/${createdProject.id}/image-plans/${planIdsByIndex.get(index)}/preferred-image`)) {
        throw new Error(`preferred plan mismatch for 图${index}: expected ${planIdsByIndex.get(index)}, got ${preferredResponse.url()}`);
      }
      if (preferredResponse.status() !== 200) {
        throw new Error(`preferred image failed ${preferredResponse.status()}: ${await preferredResponse.text()}`);
      }
      await waitForPreferredPlan(page, createdProject.id, index);
    }
  }
  await page.screenshot({ path: path.join(screenshotDir, "07-five-preferred.png"), fullPage: true });

  await selectPlanTab(page, 1);
  await openDetailsIfPresent(page, "workflow-step-4");
  await openDetailsIfPresent(page, "generation-history-details");
  const imagePath = await downloadFirstCandidateViaApi(app.baseUrl, createdProject.id, planIdsByIndex.get(1));
  assert(["image/png", "image/jpeg", "image/webp"].includes(await detectMime(imagePath)));

  const zipPath = await downloadPreferredZipViaApi(app.baseUrl, createdProject.id);
  const entries = parseStoredZip(await fs.readFile(zipPath));
  assert.deepEqual(entries.map((entry) => entry.name), [
    "01-hero.png",
    "02-structure.png",
    "03-function.png",
    "04-scenario.png",
    "05-detail.png",
  ]);
  await page.screenshot({ path: path.join(screenshotDir, "08-zip-export.png"), fullPage: true });

  await deleteFirstNonPreferredCandidateViaApi(app.baseUrl, createdProject.id, planIdsByIndex.get(1));

  await page.reload({ waitUntil: "networkidle" });
  await openDetailsIfPresent(page, "workflow-step-1");
  assert.equal(await page.getByTestId("reference-image-card").count(), 3);
  await stopNextApp(app);
  activeApp = null;
  activeAppHandle = null;
  const restarted = await startNextApp();
  activeApp = restarted.child;
  activeAppHandle = restarted;
  await page.goto(`${restarted.baseUrl}/projects/${createdProject.id}`, { waitUntil: "networkidle" });
  await page.getByText("等待五张首选图").or(page.getByText("已完成")).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert.equal(overflow, false, "mobile viewport must not have severe horizontal overflow");
  await page.screenshot({ path: path.join(screenshotDir, "09-mobile-final.png"), fullPage: true });

  await page.goto(restarted.baseUrl, { waitUntil: "networkidle" });
  const deleteProjectResponse = await fetch(`${restarted.baseUrl}/api/projects/${createdProject.id}`, { method: "DELETE" });
  const deleteProjectText = await deleteProjectResponse.text();
  if (deleteProjectResponse.status !== 200) {
    throw new Error(`delete project failed ${deleteProjectResponse.status}: ${deleteProjectText}`);
  }
  await browser.close();
  activeBrowser = null;
  activePage = null;
  await stopNextApp(restarted);
  activeApp = null;
  activeAppHandle = null;
  prisma = (await import("../src/lib/prisma.js")).prisma;
  await expectProjectDeleted(createdProject.id);

  assertNoSensitiveText(browserEvents.join("\n"));
  assertNoSensitiveText(JSON.stringify(providerRecords));

  const summary = {
    stage: "8",
    branch: "codex/stage-8-final-release",
    playwrightChromium: true,
    realFileInputUpload: true,
    uploadedFormats: ["jpg", "png", "webp"],
    analysisReceivedReferenceImages: providerRecords.analysisRequests[0].imageCount,
    planningReceivedProductIdentity: providerRecords.planningRequests[0].identityProductName,
    generationRequests: providerRecords.generationRequests.length,
    generatedImagesDecodable: true,
    zipEntries: entries.map((entry) => entry.name),
    restartRestored: true,
    deleteCleanup: true,
    paidImageGenerationCallsAdded: 0,
    screenshots: [
      "01-home-final.png",
      "02-create-project.png",
      "03-reference-upload.png",
      "04-product-identity.png",
      "05-five-plans.png",
      "06-generation-candidate.png",
      "07-five-preferred.png",
      "08-zip-export.png",
      "09-mobile-final.png",
      "10-startup-doctor.png",
    ],
  };
  await fs.writeFile(
    path.join(root, "docs", "stages", "stage-8", "acceptance-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await persistFailureDiagnostics(error).catch(() => {});
  throw error;
} finally {
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  if (activeAppHandle) await stopNextApp(activeAppHandle).catch(() => {});
  else if (activeApp) await stopNextApp({ child: activeApp }).catch(() => {});
  if (fakeProvider) await fakeProvider.close().catch(() => {});
  if (prisma) await prisma.$disconnect().catch(() => {});
  suppressExpectedDisconnectErrors = true;
  if (tempDb) await dropTempDatabase(tempDb).catch(() => {});
}

async function seedLocalProvider(baseUrl) {
  const { encryptSecret } = await import("../src/lib/security.js");
  await prisma.user.create({
    data: { id: userId, name: "Stage 8 E2E", email: `${userId}@local.test`, credits: 0 },
  });
  const encrypted = encryptSecret(fakeApiKey);
  const profile = await prisma.providerProfile.create({
    data: {
      userId,
      name: "阶段8本地假 Provider",
      provider: "openai-compatible",
      baseUrl,
      encryptedApiKey: encrypted.encryptedApiKey,
      apiKeyIv: encrypted.apiKeyIv,
      apiKeyAuthTag: encrypted.apiKeyAuthTag,
      apiKeyLast4: encrypted.apiKeyLast4,
      modelId: "stage-8-local-fake-model",
      protocol: "openai-image-edit",
      capabilitiesJson: JSON.stringify(["text", "vision", "image"]),
      timeoutMs: 30000,
      maxRetries: 0,
      enabled: true,
    },
  });
  await prisma.modelRoleAssignment.createMany({
    data: [
      { userId, role: "product_vision", providerProfileId: profile.id },
      { userId, role: "image_planning", providerProfileId: profile.id },
      { userId, role: "image_generation", providerProfileId: profile.id },
    ],
  });
}

async function startFakeProvider() {
  const port = await getOpenPort();
  const png = await sharp({
    create: { width: 96, height: 96, channels: 3, background: "#16a34a" },
  }).png().toBuffer();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url.startsWith("/v1/models")) {
        return json(res, { id: "stage-8-local-fake-model", object: "model" });
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const body = JSON.parse(await readRequest(req));
        const messages = body.messages || [];
        const serialized = JSON.stringify(messages);
        if (serialized.includes("image_url") || serialized.includes("data:image/")) {
          const imageCount = (serialized.match(/data:image\//g) || []).length;
          providerRecords.analysisRequests.push({ imageCount });
          return json(res, {
            choices: [{ message: { content: JSON.stringify(fakeIdentity()) } }],
          });
        }
        const userPayload = messages.find((message) => message.role === "user")?.content || "{}";
        const parsed = JSON.parse(userPayload);
        providerRecords.planningRequests.push({
          identityProductName: parsed.identity?.productName,
          referenceCount: parsed.referenceSummary?.count,
        });
        return json(res, {
          choices: [{ message: { content: JSON.stringify(fakePlans()) } }],
        });
      }
      if (req.method === "POST" && req.url === "/v1/images/edits") {
        const body = await readRequestBuffer(req);
        const text = body.toString("latin1");
        const fieldCount = (text.match(/Content-Disposition: form-data; name=/g) || []).length;
        await fs.writeFile(path.join(tmpDir, `generation-request-${providerRecords.generationRequests.length + 1}.txt`), text.slice(0, 2000), "latin1").catch(() => {});
        const referenceImageCount = Math.max(0, fieldCount - 5);
        providerRecords.generationRequests.push({ referenceImageCount });
        return json(res, { data: [{ b64_json: png.toString("base64") }] });
      }
      res.writeHead(404).end("not found");
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function fakeIdentity() {
  return {
    productName: "中文便携保温杯",
    category: "保温杯",
    color: "绿色",
    material: "金属与塑料",
    structure: "杯身、杯盖和握持部件清晰可见。",
    visibleFunctions: ["便携握持", "杯盖开合"],
    sellingPoints: ["外观简洁", "适合随身携带"],
    targetUsers: ["通勤用户", "学生"],
    usageScenarios: ["办公室", "外出"],
    mustKeep: ["保持绿色杯身", "保持杯盖结构"],
    avoidChanges: ["不要改变颜色", "不要增加不存在的配件"],
    primaryReferenceDescription: "主参考图展示绿色便携保温杯正面。",
  };
}

function fakePlans() {
  return [
    ["hero", "点击首图", "突出绿色杯身", "单杯居中大主体"],
    ["structure", "核心结构", "展示杯盖与杯身比例", "轻微俯视展示结构"],
    ["function", "核心功能", "强调便携握持", "手持场景但商品为主体"],
    ["scenario", "使用场景", "办公室饮水场景", "桌面环境商品居中"],
    ["detail", "细节理由", "展示杯盖细节", "局部特写保持完整轮廓"],
  ].map(([taskType, coreSellingPoint, scene, composition], index) => ({
    index: index + 1,
    taskType,
    coreSellingPoint,
    scene,
    composition,
    mainTitle: coreSellingPoint,
    subTitle: "商品真实一致",
    keyNotes: ["简洁中文文字", "商品主体清晰"],
    mustKeep: ["保持绿色杯身", "保持杯盖结构"],
    avoid: ["不要改变颜色", "不要增加不存在的配件", "不做拼图"],
    finalPrompt: `生成一张中文电商主图，任务为${coreSellingPoint}，场景为${scene}，构图为${composition}。保持绿色杯身和杯盖结构，不改变商品颜色，不增加不存在配件，不做拼图，比例 1:1。`,
  }));
}

async function createImageFiles() {
  const jpg = path.join(tmpDir, "阶段8-正面.jpg");
  const png = path.join(tmpDir, "阶段8-细节.png");
  const webp = path.join(tmpDir, "阶段8-场景.webp");
  await sharp({ create: { width: 80, height: 80, channels: 3, background: "#22c55e" } }).jpeg().toFile(jpg);
  await sharp({ create: { width: 80, height: 80, channels: 3, background: "#0ea5e9" } }).png().toFile(png);
  await sharp({ create: { width: 80, height: 80, channels: 3, background: "#f97316" } }).webp().toFile(webp);
  return { jpg, png, webp };
}

async function createEphemeralDatabase() {
  try {
    return await createTempDatabase();
  } catch (error) {
    console.log(`真实 PostgreSQL 未就绪，改用本地 PGlite socket 临时库：${error.code || error.message}`);
    return startPgliteDatabase();
  }
}

async function startPgliteDatabase() {
  const port = await getOpenPort();
  const dataDir = path.join(tmpDir, `pglite-${Date.now()}`);
  await fs.mkdir(dataDir, { recursive: true });
  const serverScript = path.join(root, "node_modules", "@electric-sql", "pglite-socket", "dist", "scripts", "server.js");
  const child = spawn(process.execPath, [
    serverScript,
    "--db",
    dataDir,
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "--max-connections",
    "8",
  ], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  await waitForPostgres(url, child, () => logs);
  return {
    name: "pglite",
    url,
    maintenanceUrl: "",
    pglite: { child, dataDir, logs: () => logs },
  };
}

async function createTempDatabase() {
  const source = process.env.DATABASE_URL;
  assert(source, "DATABASE_URL is required to create a temporary Stage 8 database");
  const parsed = new URL(source);
  const dbName = `aps_stage8_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`.replace(/-/g, "_");
  const maintenance = new URL(source);
  maintenance.pathname = "/postgres";
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  await client.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
  await client.end();
  parsed.pathname = `/${dbName}`;
  return { name: dbName, url: parsed.toString(), maintenanceUrl: maintenance.toString() };
}

async function dropTempDatabase(db) {
  if (db.pglite) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(db.pglite.child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      db.pglite.child.kill("SIGTERM");
    }
    await sleep(1000);
    await fs.rm(db.pglite.dataDir, { recursive: true, force: true }).catch(() => {});
    return;
  }
  const client = new Client({ connectionString: db.maintenanceUrl });
  await client.connect();
  await client.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = $1 AND pid <> pg_backend_pid()
  `, [db.name]);
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(db.name)}`);
  await client.end();
}

async function waitForPostgres(connectionString, child, logs) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`PGlite socket exited early: ${logs().slice(-2000)}`);
    }
    const client = new Client({ connectionString, connectionTimeoutMillis: 1000, query_timeout: 1000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => {});
      await sleep(500);
    }
  }
  throw new Error(`PGlite socket did not become ready: ${logs().slice(-2000)}`);
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function applySqlMigrations(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const migrationsDir = path.join(root, "prisma", "migrations");
    const migrations = (await fs.readdir(migrationsDir, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
    for (const migration of migrations) {
      const sql = await fs.readFile(path.join(migrationsDir, migration, "migration.sql"), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end().catch(() => {});
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
    env: { ...process.env, NEXTAUTH_URL: baseUrl, WEBHOOK_URL: baseUrl, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeApp = child;
  let logs = `mode=${mode}\nbaseUrl=${baseUrl}\n`;
  const logFile = path.join(diagnosticsDir, `next-${port}.log`);
  child.stdout.on("data", (chunk) => { logs += scrub(chunk.toString()); });
  child.stderr.on("data", (chunk) => { logs += scrub(chunk.toString()); });
  const persistLogs = async () => {
    await fs.writeFile(logFile, logs, "utf8").catch(() => {});
  };
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      await persistLogs();
      throw new Error(`next exited early: ${logs.slice(-2000)}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return { child, baseUrl, logs: () => logs, persistLogs };
    } catch {}
    await sleep(1000);
  }
  await persistLogs();
  throw new Error(`next did not become ready: ${logs.slice(-2000)}`);
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

async function expectProjectDeleted(projectId) {
  const [project, refs, plans, runs, images] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.referenceImage.count({ where: { projectId } }),
    prisma.imagePlan.count({ where: { projectId } }),
    prisma.imageGenerationRun.count({ where: { projectId } }),
    prisma.generatedImage.count({ where: { projectId } }),
  ]);
  assert.equal(project, null);
  assert.equal(refs + plans + runs + images, 0);
  const projectDir = path.join(root, "storage", "projects", projectId);
  await assert.rejects(fs.stat(projectDir));
}

async function selectPlanTab(page, index, expected = {}) {
  const tab = page.getByTestId(`plan-tab-${index}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await openDetailsIfPresent(page, "workflow-step-3");
    if ((await tab.count()) > 0 && await tab.first().isVisible().catch(() => false)) break;
    const toggle = page.getByTestId("workflow-step-3-toggle");
    if (await toggle.count()) await toggle.click({ force: true });
    await sleep(250);
  }
  const generationLoaded = expected.planId
    ? page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/projects/${expected.projectId}/image-plans/${expected.planId}/generations`) &&
          response.request().method() === "GET",
        { timeout: 10000 },
      ).catch(() => null)
    : null;
  const candidatesLoaded = expected.planId
    ? page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/projects/${expected.projectId}/image-plans/${expected.planId}/generated-images`) &&
          response.request().method() === "GET",
        { timeout: 10000 },
      ).catch(() => null)
    : null;
  await tab.click();
  await page.waitForFunction(
    (tabIndex) =>
      document.querySelector(`[data-testid="plan-tab-${tabIndex}"]`)?.dataset.active === "true",
    index,
    { timeout: 30000 },
  );
  if (generationLoaded && candidatesLoaded) {
    await Promise.all([generationLoaded, candidatesLoaded]);
  }
}

async function waitForPlanButtonReady(page, testId, planId, { allowDisabled = false } = {}) {
  if (["generate-current-image-button", "force-generate-current-image-button", "download-candidate-button", "set-preferred-candidate-button", "delete-candidate-button"].includes(testId)) {
    await openDetailsIfPresent(page, "workflow-step-4");
  }
  if (["download-candidate-button", "set-preferred-candidate-button", "delete-candidate-button"].includes(testId)) {
    await openDetailsIfPresent(page, "generation-history-details");
  }
  await page.waitForFunction(
    ({ id, expectedPlanId, disabledAllowed }) => {
      const element = document.querySelector(`[data-testid="${id}"][data-plan-id="${expectedPlanId}"]`);
      return element && (disabledAllowed || !element.disabled) && element.dataset.planId === expectedPlanId;
    },
    { id: testId, expectedPlanId: planId, disabledAllowed: allowDisabled },
    { timeout: 30000 },
  );
}

async function openDetailsIfPresent(page, testId) {
  const panel = page.getByTestId(testId);
  await panel.waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
  if (await panel.count() === 0) return;
  const isOpen = await panel.evaluate((element) => {
    if (element instanceof HTMLDetailsElement) return Boolean(element.open);
    return element.dataset.open === "true";
  });
  if (isOpen) return;
  const toggle = page.getByTestId(`${testId}-toggle`);
  if (await toggle.count()) {
    await page.evaluate((id) => {
      document.querySelector(`[data-testid="${id}-toggle"]`)?.click();
    }, testId);
  } else {
    await panel.evaluate((element) => {
      if (!(element instanceof HTMLDetailsElement)) return;
      element.open = true;
      element.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
  }
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) return true;
      if (element instanceof HTMLDetailsElement) return element.open === true;
      return element.dataset.open === "true";
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

async function waitForPreferredPlan(page, projectId, planIndex) {
  await page.waitForFunction(
    async ({ targetProjectId, targetPlanIndex }) => {
      const response = await fetch(`/api/projects/${targetProjectId}/generation-summary`);
      if (!response.ok) return false;
      const summary = await response.json();
      return summary.plans?.some((plan) => plan.planIndex === targetPlanIndex && plan.hasPreferred);
    },
    { targetProjectId: projectId, targetPlanIndex: planIndex },
    { timeout: 30000 },
  );
}

async function downloadFirstCandidateViaApi(baseUrl, projectId, planId) {
  const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/image-plans/${planId}/generated-images`);
  const listText = await listResponse.text();
  if (listResponse.status !== 200) {
    throw new Error(`candidate list failed ${listResponse.status}: ${listText}`);
  }
  const list = JSON.parse(listText);
  const candidate = list.items?.[0];
  assert(candidate?.id, "candidate list must include at least one generated image");
  const downloadResponse = await fetch(`${baseUrl}/api/generated-images/${candidate.id}/download`);
  const bytes = Buffer.from(await downloadResponse.arrayBuffer());
  if (downloadResponse.status !== 200) {
    throw new Error(`candidate download failed ${downloadResponse.status}: ${bytes.toString("utf8").slice(0, 1000)}`);
  }
  const filePath = path.join(tmpDir, "api-downloaded-candidate.bin");
  await fs.writeFile(filePath, bytes);
  return filePath;
}

async function downloadPreferredZipViaApi(baseUrl, projectId) {
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/exports/preferred-images`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200) {
    throw new Error(`preferred zip download failed ${response.status}: ${bytes.toString("utf8").slice(0, 1000)}`);
  }
  const filePath = path.join(tmpDir, "api-preferred-images.zip");
  await fs.writeFile(filePath, bytes);
  return filePath;
}

async function deleteFirstNonPreferredCandidateViaApi(baseUrl, projectId, planId) {
  const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/image-plans/${planId}/generated-images`);
  const listText = await listResponse.text();
  if (listResponse.status !== 200) {
    throw new Error(`candidate list before delete failed ${listResponse.status}: ${listText}`);
  }
  const list = JSON.parse(listText);
  const candidate = list.items?.find((item) => !item.isPreferred);
  if (!candidate) return;
  const deleteResponse = await fetch(`${baseUrl}/api/generated-images/${candidate.id}`, { method: "DELETE" });
  const deleteText = await deleteResponse.text();
  if (deleteResponse.status !== 200) {
    throw new Error(`delete candidate failed ${deleteResponse.status}: ${deleteText}`);
  }
}

function getPlanButton(page, testId, planId) {
  return page.locator(`[data-testid="${testId}"][data-plan-id="${planId}"]`);
}

async function postGenerationFromPage(page, projectId, planId) {
  const result = await page.evaluate(async ({ targetProjectId, targetPlanId }) => {
    const projectResponse = await fetch(`/api/projects/${targetProjectId}`);
    const project = await projectResponse.json();
    if (!projectResponse.ok) {
      return { status: projectResponse.status, body: JSON.stringify(project) };
    }
    const referenceImageIds = (project.referenceImages || [])
      .filter((image) => image.includeInGeneration || image.isPrimary)
      .map((image) => image.id);
    const response = await fetch(`/api/projects/${targetProjectId}/image-plans/${targetPlanId}/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        force: true,
        allowStaleInput: true,
        referenceImageIds,
        resolution: "1K",
        aspectRatio: project.aspectRatio || "1:1",
      }),
    });
    return { status: response.status, body: await response.text() };
  }, { targetProjectId: projectId, targetPlanId: planId });

  if (result.status !== 200) {
    throw new Error(`generation API failed ${result.status}: ${result.body}`);
  }
}

async function waitForProviderGenerationCount(expectedCount) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (providerRecords.generationRequests.length >= expectedCount) return;
    await sleep(250);
  }
  throw new Error(`provider generation request count did not reach ${expectedCount}`);
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
      "expected=Stage 8 final release Playwright flow completes without paid provider calls",
      "actual=see failed assertion or response error above",
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

function readRequest(req) {
  return readRequestBuffer(req).then((buffer) => buffer.toString("utf8"));
}

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, value) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

async function runCommand(command, args, options = {}) {
  const result = spawnSync([command, ...args].map(shellArg).join(" "), {
    cwd: root,
    env: options.env || process.env,
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${scrub(result.stdout)}\n${scrub(result.stderr)}`);
  }
}

function shellArg(value) {
  const text = String(value);
  if (!/[\s"&|<>^]/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function runNodeCapture(args, { env = process.env, timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

async function detectMime(filePath) {
  const buffer = await fs.readFile(filePath);
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "";
}

function parseStoredZip(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    assert.equal(method, 0, "zip entries must be stored");
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.push({ name, size: compressedSize });
    offset = dataStart + compressedSize;
  }
  return entries;
}

async function renderTextPng(filePath, text) {
  const escaped = text
    .replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char])
    .split(/\r?\n/)
    .slice(0, 24)
    .map((line, index) => `<text x="28" y="${42 + index * 28}" font-size="20" fill="#e5e7eb">${line}</text>`)
    .join("");
  const svg = `<svg width="1000" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#09090b"/><text x="28" y="28" font-size="22" fill="#34d399">Stage 8 Startup Doctor</text>${escaped}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
}

function scrub(value) {
  return String(value || "")
    .replaceAll(fakeApiKey, "[REDACTED]")
    .replace(/[A-Z]:\\[^\s"']+/g, "[LOCAL_PATH]")
    .replace(/postgresql:\/\/[^\s"']+/g, "postgresql://[REDACTED]");
}

function isExpectedDisconnectError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "ECONNRESET" ||
    error?.code === "57P01" ||
    message.includes("Connection terminated unexpectedly") ||
    message.includes("terminating connection due to administrator command")
  );
}

function assertNoSensitiveText(value) {
  const text = String(value || "");
  assert(!text.includes(fakeApiKey), "output must not leak fake API key");
  assert(!/encryptedApiKey|apiKeyIv|apiKeyAuthTag|Authorization|DATABASE_URL|CREDENTIAL_ENCRYPTION_KEY/i.test(text));
  assert(!/[A-Z]:\\/.test(text), "output must not leak local absolute paths");
  assert(!/data:image\/[a-z]+;base64,/i.test(text), "output must not leak image base64");
}
