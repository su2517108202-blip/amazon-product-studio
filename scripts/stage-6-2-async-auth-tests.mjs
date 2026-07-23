import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../src/lib/prisma.js";
import { encryptSecret } from "../src/lib/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ownerUserId = "stage6-2-owner";
const otherUserId = "stage6-2-other";
const prefix = "stage6-2";

const state = {
  upstreamCalls: [],
  taskModes: new Map(),
};

const providerServer = http.createServer((req, res) => {
  const taskId = decodeURIComponent(String(req.url || "").split("/").pop() || "");
  state.upstreamCalls.push(taskId);
  const mode = state.taskModes.get(taskId) || "processing";

  res.setHeader("content-type", "application/json");
  if (mode === "invalid-key") {
    res.writeHead(401);
    res.end(JSON.stringify({ error: { code: "INVALID_API_KEY", message: "invalid key" } }));
    return;
  }

  res.end(JSON.stringify({ status: mode }));
});

await new Promise((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
const providerPort = providerServer.address().port;
const providerBaseUrl = `http://127.0.0.1:${providerPort}`;

let activeApp = null;

try {
  await resetData();
  await createFixtures();

  const unauthBefore = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-unauth-run` } });
  const unauthApp = await startNextApp({ appMode: "production", defaultUserId: ownerUserId });
  const unauthCallsBefore = state.upstreamCalls.length;
  const unauthResponse = await postCheck(unauthApp.baseUrl, `${prefix}-unauth-run`);
  await stopNextApp(unauthApp);
  const unauthAfter = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-unauth-run` } });

  assert.equal(unauthResponse.status, 401, "unauthenticated async check must return 401");
  assert.equal(unauthResponse.data.code, "UNAUTHORIZED", "unauthenticated response must be safe");
  assert.equal(unauthAfter.status, unauthBefore.status, "unauthenticated check must not change status");
  assert.equal(unauthAfter.checkAttempts, unauthBefore.checkAttempts, "unauthenticated check must not increment attempts");
  assert.equal(state.upstreamCalls.length, unauthCallsBefore, "unauthenticated check must not call upstream");

  const localApp = await startNextApp({ appMode: "local", defaultUserId: ownerUserId });

  const otherBefore = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-other-run` } });
  const crossCallsBefore = state.upstreamCalls.length;
  const crossResponse = await postCheck(localApp.baseUrl, `${prefix}-other-run`);
  const otherAfter = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-other-run` } });
  assert([403, 404].includes(crossResponse.status), "cross-user async check must return 404 or 403");
  assert.equal(otherAfter.status, otherBefore.status, "cross-user check must not change status");
  assert.equal(otherAfter.checkAttempts, otherBefore.checkAttempts, "cross-user check must not increment attempts");
  assert.equal(state.upstreamCalls.length, crossCallsBefore, "cross-user check must not call upstream");
  assert(!/provider|model|externalTaskId|task-other/i.test(crossResponse.text), "cross-user response must not leak run details");

  state.taskModes.set("task-processing", "processing");
  const ownerBefore = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-owner-processing-run` } });
  const ownerCallsBefore = state.upstreamCalls.length;
  const ownerResponse = await postCheck(localApp.baseUrl, `${prefix}-owner-processing-run`);
  const ownerAfter = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-owner-processing-run` } });
  assert.equal(ownerResponse.status, 200, "owned processing check must succeed");
  assert.equal(ownerResponse.data.status, "processing", "owned processing run should remain processing");
  assert.equal(ownerAfter.checkAttempts, ownerBefore.checkAttempts + 1, "owned processing check must increment attempts");
  assert.equal(state.upstreamCalls.length, ownerCallsBefore + 1, "owned processing check must call upstream once");

  const terminalBefore = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-terminal-run` } });
  state.taskModes.set("task-terminal", "invalid-key");
  const terminalResponse = await postCheck(localApp.baseUrl, `${prefix}-terminal-run`);
  const terminalAfter = await prisma.imageGenerationRun.findUnique({ where: { id: `${prefix}-terminal-run` } });
  assert.equal(terminalResponse.status, 200, "terminal provider error should return the updated run");
  assert.equal(terminalAfter.status, "failed", "terminal provider error must fail owned run");
  assert.equal(terminalAfter.errorCode, "INVALID_API_KEY", "terminal provider error code must be persisted");
  assert.equal(terminalAfter.checkAttempts, terminalBefore.checkAttempts + 1, "terminal provider error must only update owned run");

  const terminalCalls = state.upstreamCalls.length;
  const completedResponse = await postCheck(localApp.baseUrl, `${prefix}-completed-run`);
  const failedResponse = await postCheck(localApp.baseUrl, `${prefix}-failed-run`);
  assert.equal(completedResponse.status, 200, "owned completed run should be readable");
  assert.equal(failedResponse.status, 200, "owned failed run should be readable");
  assert.equal(completedResponse.data.status, "completed", "completed run status should be preserved");
  assert.equal(failedResponse.data.status, "failed", "failed run status should be preserved");
  assert.equal(state.upstreamCalls.length, terminalCalls, "completed/failed checks must not call upstream");

  await stopNextApp(localApp);

  console.log(JSON.stringify({
    unauthenticatedDenied: true,
    crossUserDenied: true,
    ownerProcessingRegression: true,
    terminalProviderErrorOwnedOnly: true,
    terminalRunsSkipUpstream: true,
  }, null, 2));
} finally {
  if (activeApp) await stopNextApp(activeApp).catch(() => {});
  providerServer.close();
  await resetData().catch(() => {});
  await prisma.$disconnect();
}

async function createFixtures() {
  await prisma.user.upsert({
    where: { id: ownerUserId },
    update: {},
    create: { id: ownerUserId, name: "Stage 6.2 Owner", email: `${ownerUserId}@local.test`, credits: 0 },
  });
  await prisma.user.upsert({
    where: { id: otherUserId },
    update: {},
    create: { id: otherUserId, name: "Stage 6.2 Other", email: `${otherUserId}@local.test`, credits: 0 },
  });

  await createProjectSet(ownerUserId, `${prefix}-owner-project`, `${prefix}-owner-plan`);
  await createProjectSet(otherUserId, `${prefix}-other-project`, `${prefix}-other-plan`);

  await createProvider(ownerUserId, `${prefix}-owner-provider`);
  await createProvider(otherUserId, `${prefix}-other-provider`);

  await createRun({
    id: `${prefix}-unauth-run`,
    projectId: `${prefix}-owner-project`,
    imagePlanId: `${prefix}-owner-plan`,
    providerProfileId: `${prefix}-owner-provider`,
    externalTaskId: "task-unauth",
    checkAttempts: 7,
  });
  await createRun({
    id: `${prefix}-other-run`,
    projectId: `${prefix}-other-project`,
    imagePlanId: `${prefix}-other-plan`,
    providerProfileId: `${prefix}-other-provider`,
    externalTaskId: "task-other",
    checkAttempts: 3,
  });
  await createRun({
    id: `${prefix}-owner-processing-run`,
    projectId: `${prefix}-owner-project`,
    imagePlanId: `${prefix}-owner-plan`,
    providerProfileId: `${prefix}-owner-provider`,
    externalTaskId: "task-processing",
  });
  await createRun({
    id: `${prefix}-terminal-run`,
    projectId: `${prefix}-owner-project`,
    imagePlanId: `${prefix}-owner-plan`,
    providerProfileId: `${prefix}-owner-provider`,
    externalTaskId: "task-terminal",
  });
  await createRun({
    id: `${prefix}-completed-run`,
    projectId: `${prefix}-owner-project`,
    imagePlanId: `${prefix}-owner-plan`,
    providerProfileId: `${prefix}-owner-provider`,
    externalTaskId: "task-completed",
    status: "completed",
    completedAt: new Date(),
  });
  await createRun({
    id: `${prefix}-failed-run`,
    projectId: `${prefix}-owner-project`,
    imagePlanId: `${prefix}-owner-plan`,
    providerProfileId: `${prefix}-owner-provider`,
    externalTaskId: "task-failed",
    status: "failed",
    errorCode: "ASYNC_TASK_FAILED",
    errorMessage: "controlled failed run",
    completedAt: new Date(),
  });
}

async function createProjectSet(userId, projectId, planId) {
  await prisma.project.create({
    data: {
      id: projectId,
      userId,
      name: projectId,
      imagePlans: {
        create: {
          id: planId,
          planIndex: 1,
          taskType: "hero",
          coreSellingPoint: "controlled test",
          scene: "controlled test",
          composition: "controlled test",
          keyNotesJson: "[]",
          mustKeepJson: "[]",
          avoidJson: "[]",
          finalPrompt: "controlled test prompt",
        },
      },
    },
  });
}

async function createProvider(userId, id) {
  const encrypted = encryptSecret("stage-6-2-fake-key");
  await prisma.providerProfile.create({
    data: {
      id,
      userId,
      name: id,
      provider: "openai-compatible",
      baseUrl: providerBaseUrl,
      encryptedApiKey: encrypted.encryptedApiKey,
      apiKeyIv: encrypted.apiKeyIv,
      apiKeyAuthTag: encrypted.apiKeyAuthTag,
      apiKeyLast4: encrypted.apiKeyLast4,
      modelId: "generic-contract-test",
      protocol: "generic-async-image",
      capabilitiesJson: JSON.stringify(["asyncImage"]),
      enabled: true,
    },
  });
}

async function createRun({
  id,
  projectId,
  imagePlanId,
  providerProfileId,
  externalTaskId,
  status = "processing",
  checkAttempts = 0,
  errorCode = null,
  errorMessage = null,
  completedAt = null,
}) {
  await prisma.imageGenerationRun.create({
    data: {
      id,
      projectId,
      imagePlanId,
      providerProfileId,
      provider: "openai-compatible",
      model: "generic-contract-test",
      protocol: "generic-async-image",
      status,
      mode: "async",
      externalTaskId,
      promptSnapshot: "stage 6.2 async auth test",
      aspectRatio: "1:1",
      resolution: "1K",
      checkAttempts,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      errorCode,
      errorMessage,
      completedAt,
    },
  });
}

async function resetData() {
  await prisma.generatedImage.deleteMany({ where: { projectId: { startsWith: prefix } } });
  await prisma.imageGenerationRun.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.providerProfile.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.imagePlan.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.project.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } });
}

async function postCheck(baseUrl, runId) {
  const response = await fetch(`${baseUrl}/api/image-generations/${runId}/check`, { method: "POST" });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  return { status: response.status, data, text };
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
