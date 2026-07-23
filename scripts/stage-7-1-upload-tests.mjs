import "dotenv/config";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../src/lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage7-1-upload";
const ownerUserId = `${prefix}-owner`;
const otherUserId = `${prefix}-other`;
const ownerProjectId = `${prefix}-project`;
const otherProjectId = `${prefix}-other-project`;

let activeApp = null;

try {
  await resetData();
  await createFixtures();

  const app = await startNextApp({ appMode: "local", defaultUserId: ownerUserId });
  activeApp = app.child;

  const jpg = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(jpegBuffer(), "单张 JPG 测试.jpg", "image/jpeg"),
  ]);
  assert.equal(jpg.status, 201, "JPG upload must succeed");
  assert.equal(jpg.data[0].mimeType, "image/jpeg", "JPG MIME is detected from content");
  assert.equal(jpg.data[0].isPrimary, true, "first uploaded image becomes primary");
  assert.equal(jpg.data[0].includeInAnalysis, true, "first image participates in analysis");
  assert.equal(jpg.data[0].includeInGeneration, true, "first image participates in generation");

  const png = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(pngBuffer(), "单张 PNG 测试.png", "image/png"),
  ]);
  assert.equal(png.status, 201, "PNG upload must succeed");
  assert.equal(png.data[0].mimeType, "image/png", "PNG MIME is detected from content");
  assert.equal(png.data[0].isPrimary, false, "later images do not become primary");

  const webp = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(webpBuffer(), "单张 WebP 测试.webp", "image/webp"),
  ]);
  assert.equal(webp.status, 201, "WebP upload must succeed");
  assert.equal(webp.data[0].mimeType, "image/webp", "WebP MIME is detected from content");

  const cn = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(pngBuffer(), "中文 文件名 带空格.png", "image/png"),
  ]);
  assert.equal(cn.status, 201, "Chinese filename with spaces must succeed");
  assert.equal(cn.data[0].fileName, "中文 文件名 带空格.png", "original Chinese filename is preserved for UI");
  assertNoSensitiveFields(cn.text);

  const beforeBatch = await countProjectImages(ownerProjectId);
  const batch = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(jpegBuffer(), "batch-a.jpg", "image/jpeg"),
    fileFromBuffer(pngBuffer(), "batch b.png", "image/png"),
    fileFromBuffer(webpBuffer(), "batch-c.webp", "image/webp"),
    fileFromBuffer(pngBuffer(), "batch-中文.png", "image/png"),
  ]);
  assert.equal(batch.status, 201, "four-image batch upload must succeed");
  assert.equal(batch.data.length, 4, "batch response contains four images");
  assert.equal(await countProjectImages(ownerProjectId), beforeBatch + 4, "batch creates all rows");

  const invalidStartCount = await countProjectImages(ownerProjectId);
  const invalidStartFiles = await listReferenceStorage(ownerProjectId);

  const empty = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(Buffer.alloc(0), "empty.png", "image/png"),
  ]);
  assert.equal(empty.status, 400, "empty image must be rejected");
  assert.equal(empty.data.code, "EMPTY_FILE", "empty file has stable error code");
  assert.match(empty.data.error, /空文件/, "empty file error is Chinese and specific");

  const notImage = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(Buffer.from("not an image"), "not-image.txt", "text/plain"),
  ]);
  assert.equal(notImage.status, 400, "non-image file must be rejected");
  assert.equal(notImage.data.code, "UNSUPPORTED_IMAGE_TYPE", "non-image has stable error code");

  const spoofed = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(Buffer.from("fake png bytes"), "fake.png", "image/png"),
  ]);
  assert.equal(spoofed.status, 400, "spoofed MIME must be rejected by signature");
  assert.equal(spoofed.data.code, "INVALID_IMAGE_SIGNATURE", "signature error has stable code");

  const tooLarge = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(hugePngBuffer(), "huge.png", "image/png"),
  ]);
  assert.equal(tooLarge.status, 413, "oversized image must be rejected");
  assert.equal(tooLarge.data.code, "IMAGE_TOO_LARGE", "oversized image has stable error code");

  const mixed = await uploadFiles(app.baseUrl, ownerProjectId, [
    fileFromBuffer(pngBuffer(), "valid-before-invalid.png", "image/png"),
    fileFromBuffer(Buffer.from("not an image"), "bad.txt", "text/plain"),
  ]);
  assert.equal(mixed.status, 400, "mixed invalid batch must fail");
  assert.equal(await countProjectImages(ownerProjectId), invalidStartCount, "invalid attempts leave no database rows");
  assert.deepEqual(
    await listReferenceStorage(ownerProjectId),
    invalidStartFiles,
    "invalid attempts leave no orphan files",
  );

  const overLimit = await uploadFiles(app.baseUrl, ownerProjectId, Array.from({ length: 7 }, (_, index) =>
    fileFromBuffer(pngBuffer(), `limit-${index}.png`, "image/png"),
  ));
  assert.equal(overLimit.status, 409, "image count limit must be enforced before writes");
  assert.equal(overLimit.data.code, "TOO_MANY_REFERENCE_IMAGES", "limit error has stable code");

  const crossUser = await uploadFiles(app.baseUrl, otherProjectId, [
    fileFromBuffer(pngBuffer(), "cross.png", "image/png"),
  ]);
  assert.equal(crossUser.status, 404, "cross-user upload must be denied");
  assert.equal(crossUser.data.code, "PROJECT_NOT_FOUND", "cross-user response is safe");
  assertNoSensitiveFields(crossUser.text);

  const project = await jsonRequest(app.baseUrl, `/api/projects/${ownerProjectId}`);
  assert.equal(project.status, 200, "uploaded project must be readable after refresh");
  assert.equal(project.data.referenceImages.length, 8, "successful uploaded images recover after refresh");
  assert.equal(project.data.referenceImages.filter((image) => image.isPrimary).length, 1, "only one primary image remains");

  await stopNextApp(app);
  activeApp = null;
  const restarted = await startNextApp({ appMode: "local", defaultUserId: ownerUserId });
  activeApp = restarted.child;
  const recovered = await jsonRequest(restarted.baseUrl, `/api/projects/${ownerProjectId}`);
  assert.equal(recovered.status, 200, "uploaded project must be readable after service restart");
  assert.equal(recovered.data.referenceImages.length, 8, "uploaded images recover after service restart");

  await stopNextApp(restarted);
  activeApp = null;

  console.log(JSON.stringify({
    jpgUpload: { status: jpg.status, mimeType: jpg.data[0].mimeType },
    pngUpload: { status: png.status, mimeType: png.data[0].mimeType },
    webpUpload: { status: webp.status, mimeType: webp.data[0].mimeType },
    chineseFilenameUpload: { status: cn.status, fileNamePreserved: true },
    fourImageBatchUpload: { status: batch.status, count: batch.data.length },
    invalidBatchAtomic: true,
    emptyRejected: { status: empty.status, code: empty.data.code },
    nonImageRejected: { status: notImage.status, code: notImage.data.code },
    spoofedMimeRejected: { status: spoofed.status, code: spoofed.data.code },
    oversizedRejected: { status: tooLarge.status, code: tooLarge.data.code },
    overLimitRejected: { status: overLimit.status, code: overLimit.data.code },
    crossUserDenied: { status: crossUser.status, code: crossUser.data.code },
    refreshAndRestartRecovery: true,
  }, null, 2));
} finally {
  if (activeApp) await stopNextApp({ child: activeApp }).catch(() => {});
  await resetData().catch(() => {});
  await prisma.$disconnect();
}

async function createFixtures() {
  await prisma.user.create({
    data: { id: ownerUserId, name: "Stage 7.1 Owner", email: `${ownerUserId}@local.test`, credits: 0 },
  });
  await prisma.user.create({
    data: { id: otherUserId, name: "Stage 7.1 Other", email: `${otherUserId}@local.test`, credits: 0 },
  });
  await prisma.project.create({
    data: {
      id: ownerProjectId,
      userId: ownerUserId,
      name: "阶段7.1上传测试",
      productName: "银色便携咖啡杯",
      platform: "通用电商",
      aspectRatio: "1:1",
    },
  });
  await prisma.project.create({
    data: {
      id: otherProjectId,
      userId: otherUserId,
      name: "阶段7.1他人项目",
      productName: "他人商品",
      platform: "通用电商",
      aspectRatio: "1:1",
    },
  });
}

async function resetData() {
  await prisma.referenceImage.deleteMany({ where: { projectId: { in: [ownerProjectId, otherProjectId] } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: [ownerProjectId, otherProjectId] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } }).catch(() => {});
  await fs.rm(path.join(root, "storage", "projects", ownerProjectId), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(root, "storage", "projects", otherProjectId), { recursive: true, force: true }).catch(() => {});
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
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  return { status: response.status, data, text, headers: response.headers };
}

async function jsonRequest(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  return { status: response.status, data, text, headers: response.headers };
}

async function countProjectImages(projectId) {
  return prisma.referenceImage.count({ where: { projectId } });
}

async function listReferenceStorage(projectId) {
  const dir = path.join(root, "storage", "projects", projectId, "references");
  try {
    return (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
}

function fileFromBuffer(buffer, name, type) {
  return new File([buffer], name, { type });
}

function pngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
}

function jpegBuffer() {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=",
    "base64",
  );
}

function webpBuffer() {
  return Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/vuUAAA=", "base64");
}

function hugePngBuffer() {
  const buffer = Buffer.alloc(12 * 1024 * 1024 + 1024, 0);
  pngBuffer().copy(buffer);
  return buffer;
}

function assertNoSensitiveFields(text) {
  assert(!/[A-Z]:\\|\/home\/|\/mnt\/|storage\\projects|localPath|Authorization|apiKey|encryptedApiKey|password/i.test(text), "upload response must not leak sensitive fields or absolute paths");
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
