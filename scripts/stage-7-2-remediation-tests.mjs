import "dotenv/config";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma.js";
import {
  referenceImageSupportStatus,
  supportsReferenceImagesProfile,
} from "../src/lib/provider-profiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage7-2";
const ownerUserId = `${prefix}-owner`;
const otherUserId = `${prefix}-other`;
const mismatchProjectId = `${prefix}-mime-project`;
const concurrentPrimaryProjectId = `${prefix}-primary-project`;
const limitProjectId = `${prefix}-limit-project`;
const pageProjectId = `${prefix}-pagination-project`;
const pagePlanId = `${prefix}-pagination-plan`;
const pageExactProjectId = `${prefix}-pagination-exact-project`;
const pageExactPlanId = `${prefix}-pagination-exact-plan`;
const primarySwitchProjectId = `${prefix}-primary-switch-project`;
let activeApp = null;

try {
  await resetData();
  await createFixtures();
  assertProviderReferenceSupport();

  const app = await startNextApp({ appMode: "local", defaultUserId: ownerUserId });
  activeApp = app.child;

  const legacy = await uploadLegacy(app.baseUrl);
  assert.equal(legacy.status, 410, "local legacy upload route must be disabled");
  assert.equal(legacy.data.code, "LEGACY_ROUTE_DISABLED");

  const validPng = await imageBuffer("png");
  const mismatch = await uploadFiles(app.baseUrl, mismatchProjectId, [
    fileFromBuffer(validPng, "真实PNG但扩展名是JPG.jpg", "image/jpeg"),
  ]);
  assert.equal(mismatch.status, 201, "valid PNG bytes with .jpg name must upload");
  assert.equal(mismatch.data[0].mimeType, "image/png");
  assert.match(mismatch.data[0].storageKey, /\.png$/);
  assert.equal(mismatch.data[0].fileName, "真实PNG但扩展名是JPG.jpg");

  for (const [format, mime] of [
    ["png", "image/png"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ]) {
    const corrupt = await uploadFiles(app.baseUrl, mismatchProjectId, [
      fileFromBuffer(corruptMiddle(await imageBuffer(format, 64)), `中段损坏-${format}.${format === "jpeg" ? "jpg" : format}`, mime),
    ]);
    assert.equal(corrupt.status, 400, `middle-corrupt ${format} image must be rejected`);
    assert.equal(corrupt.data.code, "INVALID_IMAGE_CONTENT");
  }

  const beforeNames = await listReferenceStorage(concurrentPrimaryProjectId);
  const sameName = "同毫秒同名.png";
  const [firstConcurrent, secondConcurrent] = await Promise.all([
    uploadFiles(app.baseUrl, concurrentPrimaryProjectId, [fileFromBuffer(validPng, sameName, "image/png")]),
    uploadFiles(app.baseUrl, concurrentPrimaryProjectId, [fileFromBuffer(validPng, sameName, "image/png")]),
  ]);
  assert.equal(firstConcurrent.status, 201);
  assert.equal(secondConcurrent.status, 201);
  const primaryImages = await prisma.referenceImage.findMany({
    where: { projectId: concurrentPrimaryProjectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  assert.equal(primaryImages.length, 2, "both concurrent uploads persist");
  assert.equal(primaryImages.filter((image) => image.isPrimary).length, 1, "only one primary remains");
  assert.equal(new Set(primaryImages.map((image) => image.storageKey)).size, 2, "storage keys are unique");
  assert(
    (await listReferenceStorage(concurrentPrimaryProjectId)).length >= beforeNames.length + 2,
    "concurrent upload files are stored without overwrite",
  );

  const limitBefore = await prisma.referenceImage.count({ where: { projectId: limitProjectId } });
  assert.equal(limitBefore, 13);
  const [limitA, limitB] = await Promise.all([
    uploadFiles(app.baseUrl, limitProjectId, [fileFromBuffer(validPng, "limit-a.png", "image/png")]),
    uploadFiles(app.baseUrl, limitProjectId, [fileFromBuffer(validPng, "limit-b.png", "image/png")]),
  ]);
  assert.deepEqual(
    [limitA.status, limitB.status].sort(),
    [201, 409],
    "near-limit concurrent uploads allow exactly one request",
  );
  assert.equal(await prisma.referenceImage.count({ where: { projectId: limitProjectId } }), 14);

  const switchImages = await prisma.referenceImage.findMany({
    where: { projectId: primarySwitchProjectId },
    orderBy: { sortOrder: "asc" },
  });
  assert.equal(switchImages.length, 3);
  const [switchA, switchB] = await Promise.all([
    patchJson(app.baseUrl, `/api/reference-images/${switchImages[1].id}`, { isPrimary: true }),
    patchJson(app.baseUrl, `/api/reference-images/${switchImages[2].id}`, { isPrimary: true }),
  ]);
  assert.equal(switchA.status, 200);
  assert.equal(switchB.status, 200);
  const switched = await prisma.referenceImage.findMany({
    where: { projectId: primarySwitchProjectId },
    orderBy: { sortOrder: "asc" },
  });
  const primaryAfterSwitch = switched.filter((image) => image.isPrimary);
  assert.equal(primaryAfterSwitch.length, 1, "concurrent primary switches leave exactly one primary");
  const projectAfterSwitch = await prisma.project.findUnique({ where: { id: primarySwitchProjectId } });
  assert.equal(projectAfterSwitch.coverImageUrl, primaryAfterSwitch[0].url, "cover follows the final primary image");
  const staleIdentity = await prisma.productIdentity.findUnique({ where: { projectId: primarySwitchProjectId } });
  assert.equal(staleIdentity.isStale, true, "primary switch marks product identity stale");
  assert.equal(
    await prisma.imagePlan.count({ where: { projectId: primarySwitchProjectId, isStale: true } }),
    1,
    "primary switch marks image plans stale",
  );

  const cross = await uploadFiles(app.baseUrl, `${prefix}-other-project`, [
    fileFromBuffer(validPng, "cross.png", "image/png"),
  ]);
  assert.equal(cross.status, 404, "cross-user upload remains denied");

  const firstPage = await jsonRequest(
    app.baseUrl,
    `/api/projects/${pageProjectId}/image-plans/${pagePlanId}/generated-images`,
  );
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.data.items.length, 12);
  assert(firstPage.data.nextCursor, "first page exposes nextCursor");
  const secondPage = await jsonRequest(
    app.baseUrl,
    `/api/projects/${pageProjectId}/image-plans/${pagePlanId}/generated-images?cursor=${firstPage.data.nextCursor}`,
  );
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.data.items.length, 12);
  const thirdPage = await jsonRequest(
    app.baseUrl,
    `/api/projects/${pageProjectId}/image-plans/${pagePlanId}/generated-images?cursor=${secondPage.data.nextCursor}`,
  );
  assert.equal(thirdPage.status, 200);
  assert.equal(thirdPage.data.items.length, 1);
  assert.equal(thirdPage.data.nextCursor, null);
  const allIds = [...firstPage.data.items, ...secondPage.data.items, ...thirdPage.data.items].map((item) => item.id);
  assert.equal(allIds.length, 25);
  assert.equal(new Set(allIds).size, 25, "pagination has no duplicates");

  const exactFirstPage = await jsonRequest(
    app.baseUrl,
    `/api/projects/${pageExactProjectId}/image-plans/${pageExactPlanId}/generated-images`,
  );
  assert.equal(exactFirstPage.status, 200);
  assert.equal(exactFirstPage.data.items.length, 12);
  assert(exactFirstPage.data.nextCursor, "24-candidate first page exposes nextCursor");
  const exactSecondPage = await jsonRequest(
    app.baseUrl,
    `/api/projects/${pageExactProjectId}/image-plans/${pageExactPlanId}/generated-images?cursor=${exactFirstPage.data.nextCursor}`,
  );
  assert.equal(exactSecondPage.status, 200);
  assert.equal(exactSecondPage.data.items.length, 12);
  assert.equal(exactSecondPage.data.nextCursor, null, "24-candidate second page is terminal");
  const exactIds = [...exactFirstPage.data.items, ...exactSecondPage.data.items].map((item) => item.id);
  assert.equal(exactIds.length, 24);
  assert.equal(new Set(exactIds).size, 24, "24-candidate pagination has no duplicates");

  await stopNextApp(app);
  activeApp = null;

  console.log(JSON.stringify({
    legacyUploadDisabled: true,
    mimeExtensionFromDetectedContent: true,
    corruptImageRejected: true,
    concurrentSameNameNoOverwrite: true,
    concurrentSinglePrimary: true,
    concurrentPrimarySwitchAtomic: true,
    concurrentLimitEnforced: true,
    fullPixelDecode: true,
    providerReferenceSupport: "passed",
    candidatePagination: { loaded25: 25, pages25: 3, loaded24: 24, pages24: 2 },
    paidProviderCalls: 0,
  }, null, 2));
} finally {
  if (activeApp) await stopNextApp({ child: activeApp }).catch(() => {});
  await resetData().catch(() => {});
  await prisma.$disconnect();
}

async function createFixtures() {
  await prisma.user.createMany({
    data: [
      { id: ownerUserId, name: "Stage 7.2 Owner", email: `${ownerUserId}@local.test`, credits: 0 },
      { id: otherUserId, name: "Stage 7.2 Other", email: `${otherUserId}@local.test`, credits: 0 },
    ],
  });
  await prisma.project.createMany({
    data: [
      projectData(mismatchProjectId, ownerUserId, "MIME 扩展名测试"),
      projectData(concurrentPrimaryProjectId, ownerUserId, "并发主图测试"),
      projectData(limitProjectId, ownerUserId, "并发数量限制测试"),
      projectData(pageProjectId, ownerUserId, "候选分页测试"),
      projectData(pageExactProjectId, ownerUserId, "候选分页整页测试"),
      projectData(primarySwitchProjectId, ownerUserId, "并发主图切换测试"),
      projectData(`${prefix}-other-project`, otherUserId, "他人项目"),
    ],
  });
  await prisma.referenceImage.createMany({
    data: Array.from({ length: 13 }, (_, index) => ({
      id: `${prefix}-limit-ref-${index + 1}`,
      projectId: limitProjectId,
      url: `/api/storage/projects/${limitProjectId}/references/existing-${index + 1}.png`,
      localPath: null,
      storageKey: `projects/${limitProjectId}/references/existing-${index + 1}.png`,
      fileName: `existing-${index + 1}.png`,
      mimeType: "image/png",
      sortOrder: index,
      isPrimary: index === 0,
      includeInAnalysis: index < 8,
      includeInGeneration: index === 0,
      imageRole: "other",
    })),
  });
  await createPrimarySwitchFixtures();
  await createPaginationFixtures(pageProjectId, pagePlanId, 25, "page");
  await createPaginationFixtures(pageExactProjectId, pageExactPlanId, 24, "exact-page");
}

async function createPaginationFixtures(projectId, planId, count, suffix) {
  await prisma.imagePlan.create({
    data: imagePlanData(planId, projectId, "分页测试"),
  });
  for (let index = 0; index < count; index += 1) {
    const runId = `${prefix}-${suffix}-run-${index + 1}`;
    const imageId = `${prefix}-${suffix}-image-${index + 1}`;
    await prisma.imageGenerationRun.create({
      data: {
        id: runId,
        projectId,
        imagePlanId: planId,
        provider: "local-test",
        model: "local-test",
        protocol: "openai-image-edit",
        status: "completed",
        mode: "sync",
        promptSnapshot: "分页测试",
        completedAt: new Date(Date.now() + index),
      },
    });
    await prisma.generatedImage.create({
      data: {
        id: imageId,
        projectId,
        imagePlanId: planId,
        generationRunId: runId,
        outputIndex: 0,
        storageKey: `projects/${projectId}/generations/${runId}/${imageId}.png`,
        mimeType: "image/png",
        width: 2,
        height: 2,
        byteSize: 10,
        sha256: crypto.createHash("sha256").update(String(index)).digest("hex"),
        sourceType: "local-test",
        createdAt: new Date(Date.now() + index),
      },
    });
  }
}

async function createPrimarySwitchFixtures() {
  await prisma.referenceImage.createMany({
    data: Array.from({ length: 3 }, (_, index) => ({
      id: `${prefix}-switch-ref-${index + 1}`,
      projectId: primarySwitchProjectId,
      url: `/api/storage/projects/${primarySwitchProjectId}/references/switch-${index + 1}.png`,
      localPath: null,
      storageKey: `projects/${primarySwitchProjectId}/references/switch-${index + 1}.png`,
      fileName: `switch-${index + 1}.png`,
      mimeType: "image/png",
      sortOrder: index,
      isPrimary: index === 0,
      includeInAnalysis: true,
      includeInGeneration: index === 0,
      imageRole: "other",
    })),
  });
  await prisma.project.update({
    where: { id: primarySwitchProjectId },
    data: { coverImageUrl: `/api/storage/projects/${primarySwitchProjectId}/references/switch-1.png` },
  });
  await prisma.productIdentity.create({
    data: {
      projectId: primarySwitchProjectId,
      productName: "并发主图测试",
      category: "测试",
      color: "黑色",
      material: "塑料",
      structure: "测试结构",
      visibleFunctionsJson: "[]",
      sellingPointsJson: "[]",
      targetUsersJson: "[]",
      usageScenariosJson: "[]",
      mustKeepJson: "[]",
      avoidChangesJson: "[]",
      isStale: false,
    },
  });
  await prisma.imagePlan.create({
    data: imagePlanData(`${prefix}-switch-plan`, primarySwitchProjectId, "并发主图切换"),
  });
}

function imagePlanData(id, projectId, text) {
  return {
    id,
    projectId,
    planIndex: 1,
    taskType: "hero",
    coreSellingPoint: text,
    scene: text,
    composition: text,
    mainTitle: text,
    subTitle: text,
    keyNotesJson: "[]",
    mustKeepJson: "[]",
    avoidJson: "[]",
    finalPrompt: text,
  };
}

function projectData(id, userId, name) {
  return {
    id,
    userId,
    name,
    productName: "阶段 7.2 测试商品",
    platform: "通用电商",
    aspectRatio: "1:1",
  };
}

async function resetData() {
  const ids = [
    mismatchProjectId,
    concurrentPrimaryProjectId,
    limitProjectId,
    pageProjectId,
    pageExactProjectId,
    primarySwitchProjectId,
    `${prefix}-other-project`,
  ];
  await prisma.generatedImage.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.imageGenerationRun.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.imagePlan.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.referenceImage.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } }).catch(() => {});
  await Promise.all(ids.map((id) => fs.rm(path.join(root, "storage", "projects", id), { recursive: true, force: true }).catch(() => {})));
}

function assertProviderReferenceSupport() {
  assert.equal(supportsReferenceImagesProfile({ provider: "gemini", protocol: "gemini-native-image" }), true);
  assert.equal(supportsReferenceImagesProfile({ provider: "openai", protocol: "openai-image-edit" }), true);
  assert.equal(referenceImageSupportStatus({ provider: "openai", protocol: "openai-images" }), "text_only");
  assert.equal(supportsReferenceImagesProfile({ provider: "doubao", protocol: "doubao-image" }), false);
  assert.equal(referenceImageSupportStatus({ provider: "doubao", protocol: "doubao-image" }), "unverified");
  assert.equal(supportsReferenceImagesProfile({ provider: "openai-compatible", protocol: "generic-async-image" }), false);
  assert.equal(referenceImageSupportStatus({ provider: "openai-compatible", protocol: "generic-async-image" }), "unverified");
  assert.equal(referenceImageSupportStatus({ provider: "deepseek", protocol: "openai-compatible" }), "unsupported");
}

async function imageBuffer(format, size = 2) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 120, g: 160, b: 220 },
    },
  })[format]().toBuffer();
}

function corruptMiddle(buffer) {
  const head = Math.min(96, Math.floor(buffer.length / 2));
  const tail = Math.min(16, Math.floor(buffer.length / 6));
  return Buffer.concat([buffer.subarray(0, head), buffer.subarray(buffer.length - tail)]);
}

function fileFromBuffer(buffer, name, type) {
  return new File([buffer], name, { type });
}

async function uploadFiles(baseUrl, projectId, files) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  form.append("imageRole", "other");
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/reference-images`, {
    method: "POST",
    body: form,
    redirect: "manual",
  });
  return responsePayload(response);
}

async function uploadLegacy(baseUrl) {
  const form = new FormData();
  form.append("file", fileFromBuffer(await imageBuffer("png"), "legacy.png", "image/png"));
  const response = await fetch(`${baseUrl}/api/upload`, { method: "POST", body: form, redirect: "manual" });
  return responsePayload(response);
}

async function jsonRequest(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  return responsePayload(response);
}

async function patchJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return responsePayload(response);
}

async function responsePayload(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  assert(!/[A-Z]:\\|\/home\/|\/mnt\/|localPath|Authorization|apiKey|encryptedApiKey|password/i.test(text));
  return { status: response.status, data, text, headers: response.headers };
}

async function listReferenceStorage(projectId) {
  const dir = path.join(root, "storage", "projects", projectId, "references");
  try {
    return (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
}

async function startNextApp({ appMode, defaultUserId }) {
  const port = await getOpenPort();
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      APP_MODE: appMode,
      NEXT_PUBLIC_APP_MODE: appMode,
      DEFAULT_LOCAL_USER_ID: defaultUserId,
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

  const baseUrl = `http://127.0.0.1:${port}`;
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
