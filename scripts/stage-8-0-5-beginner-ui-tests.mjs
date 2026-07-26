import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  home: path.join(root, "src/app/page.js"),
  project: path.join(root, "src/app/projects/[projectId]/ProjectStudioClient.js"),
  settings: path.join(root, "src/app/settings/providers/ProviderSettingsClient.js"),
  launcher: path.join(root, "scripts/windows/Start-Lingtu-Amazon-Studio.ps1"),
  launcherShell: path.join(root, "scripts/windows/Start-Lingtu-Amazon-Studio.vbs"),
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ❌ ${name}: ${error.message}`);
  }
}

console.log("\n=== Stage 8.0.5 Beginner UI + Silent Launcher ===\n");

test("home defaults to upload-first beginner mode", () => {
  assert(source.home.includes("开始制作商品图片"));
  assert(source.home.includes('data-testid="home-quick-upload-zone"'));
  assert(source.home.includes("上传后自动创建项目"));
  assert(source.home.includes("Ctrl+V"));
  assert(source.home.includes('data-testid="home-more-settings"'));
  assert(source.home.indexOf('data-testid="home-quick-upload-zone"') < source.home.indexOf('data-testid="home-more-settings"'));
});

test("home hides technical role cards from the first screen", () => {
  assert(!source.home.includes("Provider"));
  assert(!source.home.includes("Capability"));
  assert(!source.home.includes("Model ID"));
  assert(source.home.includes("AI 服务已就绪"));
  assert(source.home.includes("还未配置 AI 服务"));
});

test("project workspace has a four-step beginner flow", () => {
  assert(source.project.includes('data-testid="project-four-step-nav"'));
  assert(source.project.includes("上传商品图"));
  assert(source.project.includes("确认商品"));
  assert(source.project.includes("选择套图方案"));
  assert(source.project.includes("生成与下载"));
  assert(source.project.includes("StepPanel"));
  assert(source.project.includes("data-current"));
});

test("project advanced areas are collapsed behind details", () => {
  assert(source.project.includes('data-testid="reference-advanced-settings"'));
  assert(source.project.includes('data-testid="identity-full-details"'));
  assert(source.project.includes('data-testid="planning-advanced-editor"'));
  assert(source.project.includes("查看生成历史"));
});

test("settings page uses four beginner tabs", () => {
  assert(source.settings.includes('data-testid="settings-beginner-tabs"'));
  assert(source.settings.includes("AI 服务"));
  assert(source.settings.includes("模型分工"));
  assert(source.settings.includes("本地存储"));
  assert(source.settings.includes("高级设置"));
});

test("settings service mode keeps technical fields out of ordinary controls", () => {
  const serviceStart = source.settings.indexOf("const serviceForm");
  const serviceEnd = source.settings.indexOf("return (", serviceStart);
  const serviceBlock = source.settings.slice(serviceStart, serviceEnd);
  assert(serviceBlock.includes("配置名称"));
  assert(serviceBlock.includes("服务商"));
  assert(serviceBlock.includes("API Key"));
  assert(serviceBlock.includes("获取模型"));
  assert(serviceBlock.includes("测试连接"));
  assert(!serviceBlock.includes("Base URL"));
  assert(!serviceBlock.includes("协议"));
  assert(!serviceBlock.includes("Capabilities"));
  assert(!serviceBlock.includes("capabilityStatus"));
});

test("settings role labels are seller-facing, not implementation codes", () => {
  assert(source.settings.includes("商品识别用哪个模型"));
  assert(source.settings.includes("文案策划用哪个模型"));
  assert(source.settings.includes("图片生成用哪个模型"));
  assert(source.settings.includes("不可用配置"));
  assert(source.settings.includes("模型没有视觉能力"));
});

test("launcher uses hidden process startup for PostgreSQL and Next.js", () => {
  assert(source.launcher.includes("Start-HiddenProcess"));
  assert(source.launcher.includes("CreateNoWindow = $true"));
  assert(source.launcher.includes("Start-HiddenProcess $PgCtl"));
  assert(source.launcher.includes("Start-HiddenProcess $env:ComSpec"));
  assert(!source.launcher.includes("& $PgCtl"));
  assert(!source.launcher.includes("Invoke-CimMethod -ClassName Win32_Process -MethodName Create"));
  assert(source.launcherShell.includes("shell.Run command, 0, False"));
  assert(source.launcherShell.includes("Start-Lingtu-Amazon-Studio.ps1"));
});

console.log(`\n${failures === 0 ? "✅ All tests passed" : `❌ ${failures} failed`}`);
process.exit(failures > 0 ? 1 : 0);
