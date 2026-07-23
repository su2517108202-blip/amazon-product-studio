import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const scannedDirs = ["src/app", "src/components", "src/lib"];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const mojibakePatterns = [
  "\uFFFD",
  "����",
  "鏃犳硶",
  "ͼ1",
  "�ڲ�",
  "δ����",
  "ʶ��",
  "߻�",
];

const files = [];
for (const dir of scannedDirs) {
  await collectFiles(path.join(root, dir), files);
}

const offenders = [];
for (const file of files) {
  const text = await fs.readFile(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  for (const pattern of mojibakePatterns) {
    if (text.includes(pattern)) offenders.push(`${relative}: contains ${JSON.stringify(pattern)}`);
  }
  if (text.includes("text-[10px]")) {
    offenders.push(`${relative}: contains user-visible text-[10px]`);
  }
}
assert.deepEqual(offenders, [], `源码存在乱码：\n${offenders.join("\n")}`);

const studio = await fs.readFile(path.join(root, "src/app/projects/[projectId]/ProjectStudioClient.js"), "utf8");
for (const required of [
  "正面",
  "背面",
  "侧面",
  "内部",
  "细节",
  "包装",
  "场景",
  "其他",
  "图1 点击首图",
  "图2 核心结构",
  "图3 核心功能",
  "图4 使用场景",
  "图5 细节理由",
  "商品识别",
  "产品身份证",
  "候选图历史",
  "首选图",
  "下载整套首选图",
  "加载更多候选图",
]) {
  assert(studio.includes(required), `工作台缺少中文文案：${required}`);
}

assert(!studio.includes("Candidate ${"), "候选图 alt 不应保留英文 Candidate");
assert(!studio.includes('label="Provider"'), "候选图信息不应保留 Provider 标签");
assert(!studio.includes('label="Model"'), "候选图信息不应保留 Model 标签");
assert(!studio.includes('label="Protocol"'), "候选图信息不应保留 Protocol 标签");
assert(!studio.includes('label="Stale"'), "候选图信息不应保留 Stale 标签");
assert(!studio.includes("font-black"), "工作台不应继续使用过度 font-black");
assert(!studio.includes("text-[10px]"), "工作台不应继续使用 10px 可读信息");
assert(!studio.includes("image/gif"), "参考图文件选择器不应展示 GIF 支持");
assert(
  studio.includes('accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"'),
  "参考图文件选择器必须只允许 JPG、PNG、WebP",
);

const home = await fs.readFile(path.join(root, "src/app/page.js"), "utf8");
const navbar = await fs.readFile(path.join(root, "src/components/Navbar.js"), "utf8");
const config = await fs.readFile(path.join(root, "src/lib/config.js"), "utf8");

assert(home.includes("灵图电商工作室"), "首页必须显示中文品牌");
assert(home.includes("本地模式"), "首页必须显示中文本地状态");
assert(navbar.includes("灵图电商工作室") || config.includes('appName: "灵图电商工作室"'), "导航栏品牌必须来自中文配置");
assert(navbar.includes("本地模式"), "导航栏必须显示中文本地状态");
assert(!home.includes("Lingtu E-commerce Studio"), "首页不得保留英文品牌副标题");
assert(!home.match(/>\s*Local\s*</), "首页不得显示英文 Local");
assert(!navbar.match(/>\s*Local\s*</), "导航栏不得显示英文 Local");
assert(!config.includes("Amazon Product Studio"), "配置不得保留旧英文品牌");

console.log(JSON.stringify({
  scannedFiles: files.length,
  mojibake: "none",
  requiredChineseStudioLabels: "present",
  typography: "readable",
  gifUploadSelector: "removed",
  englishBrandResidue: "none",
}, null, 2));

async function collectFiles(dir, output) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, output);
    } else if (extensions.has(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }
}
