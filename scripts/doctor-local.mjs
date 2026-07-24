import "dotenv/config";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { Client } from "pg";

const root = process.cwd();
const checks = [];

function add(name, ok, hint = "") {
  checks.push({ name, ok, hint });
}

function commandOk(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
  return result.status === 0;
}

async function canConnectPostgres() {
  if (!process.env.DATABASE_URL) return false;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function storageWritable() {
  const dir = path.join(root, "storage", ".doctor");
  const file = path.join(dir, "write-test.tmp");
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, "ok");
    await fs.rm(file, { force: true });
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

add("Node.js", commandOk("node", ["--version"]), "请安装 Node.js 20 或更高版本。");
add("npm", commandOk("npm", ["--version"]), "请安装 npm，或重新安装 Node.js。");
add("本地模式", (process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE) === "local", "请在 .env 中设置 APP_MODE=local。");
add("数据库地址", Boolean(process.env.DATABASE_URL), "请在 .env 中配置 PostgreSQL 连接。");
add("加密密钥", Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY), "请运行 npm run generate:credential-key 后写入 .env。");
add("PostgreSQL 连接", await canConnectPostgres(), "请确认 PostgreSQL 已启动，并且数据库可访问。");
add("storage 可写", await storageWritable(), "请确认项目 storage 目录可写。");
add("端口 3000", await portFree(3000), "端口 3000 已被占用，请关闭占用程序后重试。");

let failed = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`通过：${check.name}`);
  } else {
    failed += 1;
    console.log(`失败：${check.name}。${check.hint}`);
  }
}

if (failed > 0) {
  console.log("本地启动检查未通过。以上信息已隐藏敏感值。");
  process.exit(1);
}

console.log("本地启动检查通过。");
