import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../src/lib/prisma.js";
import { encryptSecret } from "../src/lib/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage7";
const ownerUserId = `${prefix}-owner`;
const otherUserId = `${prefix}-other`;
const ownerProjectId = `${prefix}-owner-project`;
const otherProjectId = `${prefix}-other-project`;
const syncProviderId = `${prefix}-sync-provider`;
const asyncProviderId = `${prefix}-async-provider`;
const planIds = Array.from({ length: 5 }, (_, index) => `${prefix}-owner-plan-${index + 1}`);
const otherPlanId = `${prefix}-other-plan-1`;

const state = {
  calls: [],
  taskModes: new Map(),
};

const providerServer = http.createServer(async (req, res) => {
  state.calls.push(`${req.method} ${req.url}`);
  await readRequestBody(req);
  res.setHeader("content-type", "application/json");

  if (req.method === "POST" && req.url === "/images/edits") {
    res.end(JSON.stringify({ data: [{ b64_json: pngBuffer(91).toString("base64") }] }));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/generations/")) {
    const taskId = decodeURIComponent(req.url.split("/").pop() || "");
    const mode = state.taskModes.get(taskId) || "processing";
    if (mode === "completed") {
      res.end(JSON.stringify({
        status: "completed",
        data: [{ b64_json: pngBuffer(92).toString("base64") }],
      }));
      return;
    }
    if (mode === "failed") {
      res.end(JSON.stringify({ status: "failed", error: { code: "ASYNC_TASK_FAILED", message: "failed" } }));
      return;
    }
    res.end(JSON.stringify({ status: "processing" }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

await new Promise((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
const providerBaseUrl = `http://127.0.0.1:${providerServer.address().port}`;
let activeApp = null;

try {
  await resetData();
  await createFixtures();

  const unauthApp = await startNextApp({ appMode: "production", defaultUserId: ownerUserId });
  const unauth = await jsonRequest(unauthApp.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[0]}/generated-images`);
  await stopNextApp(unauthApp);
  assert.equal(unauth.status, 401, "unauthenticated candidate list must be denied");
  assert.equal(unauth.data.code, "UNAUTHORIZED", "unauthenticated response must be safe");

  let app = await startNextApp({ appMode: "local", defaultUserId: ownerUserId });
  activeApp = app.child;

  const crossList = await jsonRequest(app.baseUrl, `/api/projects/${otherProjectId}/image-plans/${otherPlanId}/generated-images`);
  const crossSet = await jsonRequest(
    app.baseUrl,
    `/api/projects/${otherProjectId}/image-plans/${otherPlanId}/preferred-image`,
    { method: "PATCH", body: { generatedImageId: `${prefix}-other-image-1` } },
  );
  const crossDownload = await binaryRequest(app.baseUrl, `/api/generated-images/${prefix}-other-image-1/download`);
  const crossDelete = await jsonRequest(app.baseUrl, `/api/generated-images/${prefix}-other-image-1`, { method: "DELETE" });
  const crossExport = await binaryRequest(app.baseUrl, `/api/projects/${otherProjectId}/exports/preferred-images`);
  assert.equal(crossList.status, 404, "cross-user list must be denied");
  assert.equal(crossSet.status, 404, "cross-user preferred update must be denied");
  assert.equal(crossDownload.status, 404, "cross-user download must be denied");
  assert.equal(crossDelete.status, 404, "cross-user delete must be denied");
  assert.equal(crossExport.status, 404, "cross-user ZIP export must be denied");

  const initialList = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[0]}/generated-images`);
  assert.equal(initialList.status, 200, "candidate list must load");
  assert.equal(initialList.data.items.length, 2, "plan 1 starts with two candidates");
  assert.equal(initialList.data.items[0].candidateNumber, 2, "newest candidate keeps chronological candidate number");
  assertNoSensitiveFields(initialList.text);

  const oldImageId = `${prefix}-owner-p1-image-1`;
  const preferredImageId = `${prefix}-owner-p1-image-2`;
  const setOld = await setPreferred(app.baseUrl, planIds[0], oldImageId);
  assert.equal(setOld.status, 200, "preferred image can be set");
  assert.equal(setOld.data.preferredGeneratedImageId, oldImageId, "preferred image id is persisted");
  const setNew = await setPreferred(app.baseUrl, planIds[0], preferredImageId);
  assert.equal(setNew.status, 200, "preferred image can be changed");
  assert.equal(setNew.data.preferredGeneratedImageId, preferredImageId, "new preferred image id is persisted");
  const clearPreferred = await setPreferred(app.baseUrl, planIds[0], null);
  assert.equal(clearPreferred.status, 200, "preferred image can be cleared");
  assert.equal(clearPreferred.data.preferredGeneratedImageId, null, "preferred image clear is persisted");

  const crossPlan = await setPreferred(app.baseUrl, planIds[0], `${prefix}-owner-p2-image-1`);
  assert.equal(crossPlan.status, 409, "cross-plan image cannot be preferred");
  assert.equal(crossPlan.data.code, "IMAGE_NOT_IN_PLAN", "cross-plan preferred failure has stable code");
  const crossProject = await setPreferred(app.baseUrl, planIds[0], `${prefix}-other-image-1`);
  assert.equal(crossProject.status, 404, "cross-project image cannot be preferred");

  await setPreferred(app.baseUrl, planIds[0], preferredImageId);
  const refreshedList = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[0]}/generated-images`);
  assert.equal(refreshedList.data.preferredGeneratedImageId, preferredImageId, "preferred image survives refresh");
  assert(refreshedList.data.items.some((item) => item.id === preferredImageId && item.isPreferred), "preferred flag is restored in list");

  await stopNextApp(app);
  app = await startNextApp({ appMode: "local", defaultUserId: ownerUserId });
  activeApp = app.child;
  const restartedList = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[0]}/generated-images`);
  assert.equal(restartedList.status, 200, `candidate list must load after restart: ${restartedList.text}`);
  assert.equal(restartedList.data.preferredGeneratedImageId, preferredImageId, "preferred image survives service restart");

  const download = await binaryRequest(app.baseUrl, `/api/generated-images/${preferredImageId}/download`);
  const preferredRow = await prisma.generatedImage.findUnique({ where: { id: preferredImageId } });
  assert.equal(download.status, 200, "single image download must succeed");
  assert.equal(download.headers.get("content-type"), "image/png", "download content type must match image");
  assert.match(download.headers.get("content-disposition") || "", /attachment; filename="01-hero-candidate-02\.png"/);
  assert(!/[\\/]|:/.test(download.headers.get("content-disposition") || ""), "download filename must not contain paths");
  assert.equal(sha256(download.buffer), preferredRow.sha256, "download bytes must match database sha256");

  const deleteOld = await jsonRequest(app.baseUrl, `/api/generated-images/${oldImageId}`, { method: "DELETE" });
  assert.equal(deleteOld.status, 200, "non-preferred candidate can be deleted");
  const oldAfterDelete = await prisma.generatedImage.findUnique({ where: { id: oldImageId } });
  const oldRun = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-owner-p1-run-1` } });
  assert(oldAfterDelete.deletedAt, "deleted candidate is soft-deleted in database");
  assert.equal(await fileExists(storagePathFor(ownerProjectId, `${prefix}-owner-p1-run-1`, oldImageId)), false, "deleted candidate file is removed");
  assert.equal(oldRun.status, "completed", "deleting a candidate preserves the generation run");

  const deletePreferred = await jsonRequest(app.baseUrl, `/api/generated-images/${preferredImageId}`, { method: "DELETE" });
  assert.equal(deletePreferred.status, 409, "preferred candidate deletion must be blocked");
  assert.equal(deletePreferred.data.code, "PREFERRED_IMAGE_DELETE_BLOCKED", "preferred delete failure has stable code");

  const missingDownload = await binaryRequest(app.baseUrl, `/api/generated-images/${prefix}-owner-missing-download/download`);
  assert.equal(missingDownload.status, 404, "missing generated file returns safe error");

  for (let index = 0; index < 5; index += 1) {
    const imageId = index === 0 ? preferredImageId : `${prefix}-owner-p${index + 1}-image-1`;
    const preferred = await setPreferred(app.baseUrl, planIds[index], imageId);
    assert.equal(preferred.status, 200, `plan ${index + 1} preferred image can be set`);
  }
  const zip = await binaryRequest(app.baseUrl, `/api/projects/${ownerProjectId}/exports/preferred-images`);
  assert.equal(zip.status, 200, "5/5 preferred images export must succeed");
  assert.equal(zip.headers.get("content-type"), "application/zip", "ZIP content type must be set");
  const zipEntries = parseStoredZip(zip.buffer);
  assert.deepEqual(
    zipEntries.map((entry) => entry.name),
    ["01-hero.png", "02-structure.png", "03-function.png", "04-scenario.png", "05-detail.png"],
    "ZIP entry names must be fixed and ordered",
  );
  assert(zipEntries.every((entry) => !entry.name.includes("/") && !entry.name.includes("\\") && !entry.name.includes("..")), "ZIP entries must not contain paths");
  const expectedZipShas = [
    preferredImageId,
    `${prefix}-owner-p2-image-1`,
    `${prefix}-owner-p3-image-1`,
    `${prefix}-owner-p4-image-1`,
    `${prefix}-owner-p5-image-1`,
  ].map(async (id) => (await prisma.generatedImage.findUnique({ where: { id } })).sha256);
  assert.deepEqual(zipEntries.map((entry) => sha256(entry.data)), await Promise.all(expectedZipShas), "ZIP bytes must match preferred images");

  const missingPreferred = await setPreferred(app.baseUrl, planIds[4], null);
  assert.equal(missingPreferred.status, 200, "preferred can be cleared before incomplete ZIP test");
  const incompleteZip = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/exports/preferred-images`);
  assert.equal(incompleteZip.status, 409, "ZIP must be rejected when preferred set is incomplete");
  assert.equal(incompleteZip.data.code, "PREFERRED_SET_INCOMPLETE", "incomplete ZIP has stable code");
  assert(incompleteZip.data.missingPlans.some((plan) => plan.planIndex === 5), "incomplete ZIP lists missing plan");

  await prisma.imagePlan.update({
    where: { id: planIds[4] },
    data: { preferredGeneratedImageId: `${prefix}-owner-missing-zip` },
  });
  const missingFileZip = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/exports/preferred-images`);
  assert.equal(missingFileZip.status, 409, "ZIP must be rejected when preferred file is missing");
  assert.equal(missingFileZip.data.code, "PREFERRED_FILE_MISSING", "missing preferred file has stable code");

  const plan3Before = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[2]}/generated-images`);
  const single = await jsonRequest(
    app.baseUrl,
    `/api/projects/${ownerProjectId}/image-plans/${planIds[2]}/generations`,
    { method: "POST", body: generationPayload({ force: false }) },
  );
  assert.equal(single.status, 200, "stage 6 single-image generation regression must succeed with fake provider");
  assert.equal(single.data.reused, false, "first matching generation is not reused");
  const reused = await jsonRequest(
    app.baseUrl,
    `/api/projects/${ownerProjectId}/image-plans/${planIds[2]}/generations`,
    { method: "POST", body: generationPayload({ force: false }) },
  );
  assert.equal(reused.status, 200, "stage 6 fingerprint reuse request must succeed");
  assert.equal(reused.data.reused, true, "fingerprint reuse remains active");
  const forced = await jsonRequest(
    app.baseUrl,
    `/api/projects/${ownerProjectId}/image-plans/${planIds[2]}/generations`,
    { method: "POST", body: generationPayload({ force: true }) },
  );
  assert.equal(forced.status, 200, "force regeneration must succeed with fake provider");
  const plan3After = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[2]}/generated-images`);
  assert(plan3After.data.stats.candidateCount >= plan3Before.data.stats.candidateCount + 2, "force regeneration preserves old candidates");
  assert(plan3After.data.items.some((item) => item.isForcedVersion), "forced run is visible in candidate history");
  assert(plan3After.data.stats.failedRunCount > 0, "failed run remains visible as stats only");

  const callsBeforeTerminalChecks = state.calls.length;
  const completedCheck = await jsonRequest(app.baseUrl, `/api/image-generations/${prefix}-owner-p1-run-2/check`, { method: "POST" });
  const failedCheck = await jsonRequest(app.baseUrl, `/api/image-generations/${prefix}-owner-p1-failed-run/check`, { method: "POST" });
  assert.equal(completedCheck.status, 200, "completed run check remains safe");
  assert.equal(failedCheck.status, 200, "failed run check remains safe");
  assert.equal(state.calls.length, callsBeforeTerminalChecks, "completed/failed check does not hit provider");

  state.taskModes.set(`${prefix}-async-task`, "completed");
  const asyncBefore = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[0]}/generated-images`);
  const asyncCheck = await jsonRequest(app.baseUrl, `/api/image-generations/${prefix}-owner-p1-async-run/check`, { method: "POST" });
  assert.equal(asyncCheck.status, 200, "async check must succeed");
  assert.equal(asyncCheck.data.status, "completed", "async check completes owned run");
  const asyncAfter = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}/image-plans/${planIds[0]}/generated-images`);
  assert.equal(asyncAfter.data.stats.candidateCount, asyncBefore.data.stats.candidateCount + 1, "async completion updates candidate list");

  await stopNextApp(app);
  activeApp = null;

  console.log(JSON.stringify({
    ownership: "passed",
    unauthenticatedDenied: true,
    preferredPersistence: "passed",
    restartRecovery: "passed",
    candidateDelete: "passed",
    download: "passed",
    preferredZip: "passed",
    stage6Regression: "passed",
    asyncRegression: "passed",
  }, null, 2));
} finally {
  if (activeApp) {
    await stopNextApp({ child: activeApp }).catch(() => {});
  }
  providerServer.close();
  await resetData().catch(() => {});
  await prisma.$disconnect();
}

async function createFixtures() {
  await prisma.user.upsert({
    where: { id: ownerUserId },
    update: {},
    create: { id: ownerUserId, name: "Stage 7 Owner", email: `${ownerUserId}@local.test`, credits: 0 },
  });
  await prisma.user.upsert({
    where: { id: otherUserId },
    update: {},
    create: { id: otherUserId, name: "Stage 7 Other", email: `${otherUserId}@local.test`, credits: 0 },
  });

  await prisma.project.create({
    data: {
      id: ownerProjectId,
      userId: ownerUserId,
      name: "Stage 7 Owner Project",
      productName: "Controlled Product",
      platform: "Amazon",
      aspectRatio: "1:1",
      productIdentity: {
        create: {
          productName: "Controlled Product",
          category: "Test",
          visibleFunctionsJson: "[]",
          sellingPointsJson: "[]",
          targetUsersJson: "[]",
          usageScenariosJson: "[]",
          mustKeepJson: "[]",
          avoidChangesJson: "[]",
        },
      },
    },
  });
  await prisma.project.create({
    data: {
      id: otherProjectId,
      userId: otherUserId,
      name: "Stage 7 Other Project",
      productName: "Other Product",
      platform: "Amazon",
      aspectRatio: "1:1",
    },
  });

  await createReferenceImage();
  await createPlans(ownerProjectId, planIds);
  await createPlans(otherProjectId, [otherPlanId, ...Array.from({ length: 4 }, (_, index) => `${prefix}-other-plan-${index + 2}`)]);
  await createProviders();

  await createRunWithImage({ planIndex: 1, runIndex: 1, imageIndex: 1, createdOffset: 1 });
  await createRunWithImage({ planIndex: 1, runIndex: 2, imageIndex: 2, createdOffset: 2, isForcedVersion: true });
  await createRunWithImage({ planIndex: 2, runIndex: 1, imageIndex: 1, createdOffset: 3 });
  await createRunWithImage({ planIndex: 3, runIndex: 1, imageIndex: 1, createdOffset: 4 });
  await createRunWithImage({ planIndex: 4, runIndex: 1, imageIndex: 1, createdOffset: 5 });
  await createRunWithImage({ planIndex: 5, runIndex: 1, imageIndex: 1, createdOffset: 6 });
  await createMissingImage(`${prefix}-owner-missing-download`, planIds[1], `${prefix}-owner-missing-download-run`);
  await createMissingImage(`${prefix}-owner-missing-zip`, planIds[4], `${prefix}-owner-missing-zip-run`);
  await createFailedRun(`${prefix}-owner-p1-failed-run`, planIds[0]);
  await createFailedRun(`${prefix}-owner-p3-failed-run`, planIds[2]);
  await createAsyncRun();
  await createOtherImage();
}

async function createPlans(projectId, ids) {
  const taskTypes = ["hero", "structure", "function", "scenario", "detail"];
  for (const [index, id] of ids.entries()) {
    await prisma.imagePlan.create({
      data: {
        id,
        projectId,
        planIndex: index + 1,
        taskType: taskTypes[index],
        coreSellingPoint: `selling point ${index + 1}`,
        scene: `scene ${index + 1}`,
        composition: `composition ${index + 1}`,
        keyNotesJson: "[]",
        mustKeepJson: "[]",
        avoidJson: "[]",
        finalPrompt: `final prompt ${index + 1}`,
      },
    });
  }
}

async function createProviders() {
  const syncEncrypted = encryptSecret("stage-7-sync-fake-key");
  const asyncEncrypted = encryptSecret("stage-7-async-fake-key");
  await prisma.providerProfile.createMany({
    data: [
      {
        id: syncProviderId,
        userId: ownerUserId,
        name: "Stage 7 Sync Fake",
        provider: "openai-compatible",
        baseUrl: providerBaseUrl,
        encryptedApiKey: syncEncrypted.encryptedApiKey,
        apiKeyIv: syncEncrypted.apiKeyIv,
        apiKeyAuthTag: syncEncrypted.apiKeyAuthTag,
        apiKeyLast4: syncEncrypted.apiKeyLast4,
        modelId: "stage-7-fake-image-model",
        protocol: "openai-image-edit",
        capabilitiesJson: JSON.stringify(["image"]),
        enabled: true,
      },
      {
        id: asyncProviderId,
        userId: ownerUserId,
        name: "Stage 7 Async Fake",
        provider: "openai-compatible",
        baseUrl: providerBaseUrl,
        encryptedApiKey: asyncEncrypted.encryptedApiKey,
        apiKeyIv: asyncEncrypted.apiKeyIv,
        apiKeyAuthTag: asyncEncrypted.apiKeyAuthTag,
        apiKeyLast4: asyncEncrypted.apiKeyLast4,
        modelId: "stage-7-fake-async-model",
        protocol: "generic-async-image",
        capabilitiesJson: JSON.stringify(["asyncImage"]),
        enabled: true,
      },
    ],
  });
  await prisma.modelRoleAssignment.create({
    data: {
      userId: ownerUserId,
      role: "image_generation",
      providerProfileId: syncProviderId,
    },
  });
}

async function createReferenceImage() {
  const buffer = pngBuffer(11);
  const localPath = path.join(root, "storage", "projects", ownerProjectId, "references", "stage7-reference.png");
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
  await prisma.referenceImage.create({
    data: {
      id: `${prefix}-owner-reference`,
      projectId: ownerProjectId,
      url: `/api/storage/projects/${ownerProjectId}/references/stage7-reference.png`,
      localPath,
      storageKey: `projects/${ownerProjectId}/references/stage7-reference.png`,
      fileName: "stage7-reference.png",
      mimeType: "image/png",
      isPrimary: true,
      includeInGeneration: true,
      imageRole: "front",
    },
  });
}

async function createRunWithImage({ planIndex, runIndex, imageIndex, createdOffset, isForcedVersion = false }) {
  const planId = planIds[planIndex - 1];
  const runId = `${prefix}-owner-p${planIndex}-run-${runIndex}`;
  const imageId = `${prefix}-owner-p${planIndex}-image-${imageIndex}`;
  const buffer = pngBuffer(20 + createdOffset);
  await writeGeneratedFile(ownerProjectId, runId, imageId, buffer);
  const createdAt = new Date(Date.UTC(2026, 6, 23, 0, 0, createdOffset));
  await prisma.imageGenerationRun.create({
    data: {
      id: runId,
      projectId: ownerProjectId,
      imagePlanId: planId,
      providerProfileId: syncProviderId,
      provider: "openai-compatible",
      model: "stage-7-fixture-model",
      protocol: "openai-image-edit",
      status: "completed",
      mode: "sync",
      inputFingerprint: `${prefix}-fixture-${planIndex}-${runIndex}`,
      promptSnapshot: "stage 7 fixture prompt",
      aspectRatio: "1:1",
      resolution: "1K",
      isForcedVersion,
      durationMs: 120,
      createdAt,
      completedAt: createdAt,
    },
  });
  await prisma.generatedImage.create({
    data: generatedImageData({
      id: imageId,
      projectId: ownerProjectId,
      imagePlanId: planId,
      generationRunId: runId,
      buffer,
      createdAt,
    }),
  });
}

async function createOtherImage() {
  const runId = `${prefix}-other-run-1`;
  const imageId = `${prefix}-other-image-1`;
  const buffer = pngBuffer(88);
  await writeGeneratedFile(otherProjectId, runId, imageId, buffer);
  await prisma.imageGenerationRun.create({
    data: {
      id: runId,
      projectId: otherProjectId,
      imagePlanId: otherPlanId,
      provider: "openai-compatible",
      model: "other-model",
      protocol: "openai-image-edit",
      status: "completed",
      mode: "sync",
      promptSnapshot: "other prompt",
      completedAt: new Date(),
    },
  });
  await prisma.generatedImage.create({
    data: generatedImageData({
      id: imageId,
      projectId: otherProjectId,
      imagePlanId: otherPlanId,
      generationRunId: runId,
      buffer,
      createdAt: new Date(),
    }),
  });
}

async function createMissingImage(imageId, planId, runId) {
  const buffer = pngBuffer(77);
  await prisma.imageGenerationRun.create({
    data: {
      id: runId,
      projectId: ownerProjectId,
      imagePlanId: planId,
      provider: "openai-compatible",
      model: "stage-7-missing-file-model",
      protocol: "openai-image-edit",
      status: "completed",
      mode: "sync",
      promptSnapshot: "missing file prompt",
      completedAt: new Date(),
    },
  });
  await prisma.generatedImage.create({
    data: {
      ...generatedImageData({
        id: imageId,
        projectId: ownerProjectId,
        imagePlanId: planId,
        generationRunId: runId,
        buffer,
        createdAt: new Date(),
      }),
      storageKey: `projects/${ownerProjectId}/generations/${runId}/${imageId}.png`,
    },
  });
}

async function createFailedRun(runId, planId) {
  await prisma.imageGenerationRun.create({
    data: {
      id: runId,
      projectId: ownerProjectId,
      imagePlanId: planId,
      provider: "openai-compatible",
      model: "stage-7-fixture-model",
      protocol: "openai-image-edit",
      status: "failed",
      mode: "sync",
      promptSnapshot: "failed prompt",
      errorCode: "UPSTREAM_ERROR",
      errorMessage: "controlled failure",
      completedAt: new Date(),
    },
  });
}

async function createAsyncRun() {
  await prisma.imageGenerationRun.create({
    data: {
      id: `${prefix}-owner-p1-async-run`,
      projectId: ownerProjectId,
      imagePlanId: planIds[0],
      providerProfileId: asyncProviderId,
      provider: "openai-compatible",
      model: "stage-7-fake-async-model",
      protocol: "generic-async-image",
      status: "processing",
      mode: "async",
      externalTaskId: `${prefix}-async-task`,
      promptSnapshot: "stage 7 async prompt",
      aspectRatio: "1:1",
      resolution: "1K",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
}

function generatedImageData({ id, projectId, imagePlanId, generationRunId, buffer, createdAt }) {
  return {
    id,
    projectId,
    imagePlanId,
    generationRunId,
    outputIndex: 0,
    storageKey: `projects/${projectId}/generations/${generationRunId}/${id}.png`,
    mimeType: "image/png",
    width: 1,
    height: 1,
    byteSize: buffer.length,
    sha256: sha256(buffer),
    sourceType: "base64",
    createdAt,
  };
}

async function writeGeneratedFile(projectId, runId, imageId, buffer) {
  const filePath = storagePathFor(projectId, runId, imageId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

function storagePathFor(projectId, runId, imageId) {
  return path.join(root, "storage", "projects", projectId, "generations", runId, `${imageId}.png`);
}

async function resetData() {
  await prisma.imagePlan.updateMany({
    where: { projectId: { startsWith: prefix } },
    data: { preferredGeneratedImageId: null },
  }).catch(() => {});
  await prisma.generatedImage.deleteMany({ where: { projectId: { startsWith: prefix } } }).catch(() => {});
  await prisma.imageGenerationRun.deleteMany({ where: { projectId: { startsWith: prefix } } }).catch(() => {});
  await prisma.modelRoleAssignment.deleteMany({ where: { userId: { in: [ownerUserId, otherUserId] } } }).catch(() => {});
  await prisma.providerProfile.deleteMany({ where: { userId: { in: [ownerUserId, otherUserId] } } }).catch(() => {});
  await prisma.referenceImage.deleteMany({ where: { projectId: { startsWith: prefix } } }).catch(() => {});
  await prisma.productIdentity.deleteMany({ where: { projectId: { startsWith: prefix } } }).catch(() => {});
  await prisma.imagePlan.deleteMany({ where: { projectId: { startsWith: prefix } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { startsWith: prefix } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } }).catch(() => {});
  await fs.rm(path.join(root, "storage", "projects", ownerProjectId), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(root, "storage", "projects", otherProjectId), { recursive: true, force: true }).catch(() => {});
}

function generationPayload({ force }) {
  return {
    force,
    allowStaleInput: false,
    referenceImageIds: [`${prefix}-owner-reference`],
    resolution: "1K",
    aspectRatio: "1:1",
  };
}

function setPreferred(baseUrl, planId, generatedImageId) {
  return jsonRequest(
    baseUrl,
    `/api/projects/${ownerProjectId}/image-plans/${planId}/preferred-image`,
    { method: "PATCH", body: { generatedImageId } },
  );
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  return { status: response.status, data, text, headers: response.headers };
}

async function binaryRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    redirect: "manual",
  });
  const arrayBuffer = await response.arrayBuffer();
  let data = {};
  const text = Buffer.from(arrayBuffer).toString("utf8");
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  return {
    status: response.status,
    data,
    text,
    buffer: Buffer.from(arrayBuffer),
    headers: response.headers,
  };
}

function assertNoSensitiveFields(text) {
  assert(!/promptSnapshot|externalTaskId|Authorization|apiKey|encryptedApiKey|apiKeyIv|apiKeyAuthTag|b64_json|base64/i.test(text), "candidate API must not leak sensitive fields");
  assert(!/[A-Z]:\\\\|\/home\/|\/mnt\/|storage\\\\projects/i.test(text), "candidate API must not leak absolute local paths");
}

function parseStoredZip(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.push({ name, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd;
  }
  return entries;
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
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`next dev exited early: ${logs.slice(-2000)}`);
    }
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

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function pngBuffer(seed) {
  return Buffer.concat([
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]),
    Buffer.from([seed]),
  ]);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
