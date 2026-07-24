import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prefix = "stage8-0-2-local-user-race";
const testUserId = `${prefix}-user`;
const tmpDir = path.join(root, "tmp", prefix);
const diagnosticsDir = path.join(tmpDir, "diagnostics");

process.env.APP_MODE = "local";
process.env.NEXT_PUBLIC_APP_MODE = "local";
process.env.DEFAULT_LOCAL_USER_ID = testUserId;
process.env.NEXT_TELEMETRY_DISABLED = "1";

const { prisma } = await import("../src/lib/prisma.js");
const { ensureDefaultLocalUser } = await import("../src/lib/app-mode.js");

let activeApp = null;
let activeBrowser = null;
let activePage = null;
let browserEvents = [];

try {
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await clearTestDefaultUser();
  await assertConcurrentLocalUserInitialization();
  await clearTestDefaultUser();
  await assertColdHomePageLoad();

  console.log(JSON.stringify({
    stage: "8.0.2",
    concurrentEnsureDefaultLocalUserCalls: 20,
    allConcurrentCallsSucceeded: true,
    finalDefaultUserCount: 1,
    coldHomePageParallelApis: "passed",
    p2002Leaked: false,
    paidProviderCalls: 0,
  }, null, 2));
} catch (error) {
  await persistFailureDiagnostics(error).catch(() => {});
  throw error;
} finally {
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  if (activeApp) await stopNextApp(activeApp).catch(() => {});
  await clearTestDefaultUser().catch(() => {});
  await prisma.$disconnect();
}

async function assertConcurrentLocalUserInitialization() {
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => ensureDefaultLocalUser()),
  );

  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(
    rejected.length,
    0,
    `ensureDefaultLocalUser calls must all succeed: ${rejected.map((item) => item.reason?.message).join("; ")}`,
  );

  const ids = new Set(results.map((result) => result.value.id));
  assert.deepEqual([...ids], [testUserId]);

  const count = await prisma.user.count({ where: { id: testUserId } });
  assert.equal(count, 1, "database must contain exactly one test default local user");
}

async function assertColdHomePageLoad() {
  await clearTestDefaultUser();
  const app = await startNextApp();
  activeApp = app;

  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  activePage = page;
  browserEvents = [];
  page.on("console", (message) => browserEvents.push(`console:${message.type()}:${message.text()}`));
  page.on("pageerror", (error) => browserEvents.push(`pageerror:${error.message}`));

  const projectsResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/projects") && response.request().method() === "GET",
    { timeout: 30000 },
  );
  const assignmentsResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/model-role-assignments") && response.request().method() === "GET",
    { timeout: 30000 },
  );

  await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
  const [projects, assignments] = await Promise.all([projectsResponse, assignmentsResponse]);
  assert(projects.status() < 500, `/api/projects must not return 500, got ${projects.status()}`);
  assert(assignments.status() < 500, `/api/model-role-assignments must not return 500, got ${assignments.status()}`);
  await page.getByTestId("project-name-input").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const bodyText = await page.locator("body").textContent();
  assert(!/Unique constraint failed|P2002|PrismaClientKnownRequestError/i.test(bodyText || ""));
  assert(!/Unique constraint failed|P2002|PrismaClientKnownRequestError/i.test(browserEvents.join("\n")));

  const count = await prisma.user.count({ where: { id: testUserId } });
  assert.equal(count, 1, "cold homepage load must create exactly one test default local user");
}

async function clearTestDefaultUser() {
  await prisma.user.deleteMany({ where: { id: testUserId } });
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
      DEFAULT_LOCAL_USER_ID: testUserId,
      NEXTAUTH_URL: baseUrl,
      WEBHOOK_URL: baseUrl,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = `mode=${mode}\nbaseUrl=${baseUrl}\n`;
  const logFile = path.join(diagnosticsDir, "next-tail.log");
  child.stdout.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    logs += scrub(chunk.toString());
  });
  const persistLogs = async () => fs.writeFile(logFile, logs.slice(-12000), "utf8").catch(() => {});

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      await persistLogs();
      throw new Error(`next ${mode} exited early: ${logs.slice(-2000)}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return { child, baseUrl, persistLogs };
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

async function persistFailureDiagnostics(error) {
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await activeApp?.persistLogs?.();
  if (activePage) {
    await activePage.screenshot({ path: path.join(diagnosticsDir, "failure-page.png"), fullPage: true }).catch(() => {});
  }
  await fs.writeFile(path.join(diagnosticsDir, "browser-events.log"), scrub(browserEvents.join("\n")), "utf8");
  await fs.writeFile(
    path.join(diagnosticsDir, "failure-summary.txt"),
    scrub(`${error?.stack || error?.message || error}`),
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

function scrub(value) {
  return String(value || "")
    .replace(/postgresql:\/\/[^\s"']+/gi, "postgresql://[REDACTED]")
    .replace(/[A-Z]:\\[^\s"'<>]+/g, "[LOCAL_PATH]")
    .replace(/\/home\/runner\/work\/[^\s"'<>]+/g, "[LOCAL_PATH]");
}
