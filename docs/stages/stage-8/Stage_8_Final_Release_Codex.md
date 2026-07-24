# 阶段 8：最终产品化、全流程验收与本地发布封存

> 阶段 8 是本项目最后一个正式阶段。本轮不扩展新的供应商或大型功能，只把现有能力整理成稳定、全中文、可独立使用的本地产品。

## 基线

仓库：`su2517108202-blip/amazon-product-studio`

基线标签：`stage-7-2-1-final-closure`

基线提交：`b22112467b1ed72eb1c9b4d0309322aa9d1d2d5e`

从该提交创建：`codex/stage-8-final-release`

开始前确认工作区干净，不移动任何旧标签。

## 最终工作流

页面必须清晰支持：

```text
创建项目
→ 上传商品参考图
→ 设置主参考图、参与识别图和参与生成图
→ 商品识别
→ 产品身份证确认
→ 生成五张主图策划
→ 逐张生成图片
→ 查看候选历史
→ 分别选择五张首选图
→ 下载单图或整套 ZIP
```

不得要求普通用户理解数据库、run ID、fingerprint 或协议内部字段。

## 工作台产品化

增加四步流程导航：

```text
1 参考图
2 商品识别
3 五图策划
4 图片生成与导出
```

要求：

- 当前步骤、已完成步骤和缺失条件清晰。
- 按钮禁用时显示具体原因，不能只变灰。
- Provider、Model ID、Protocol、fingerprint 等放入“高级信息”折叠区。
- 统一“加载中、准备就绪、处理中、已完成、失败、可能过期、需要重新识别、需要重新策划、等待首选图”等中文状态。
- 保留重新识别、重新策划、强制生成、删除图片和删除项目的确认弹窗。
- 不增加自动收费调用。

## Windows 本地启动

创建：

```text
start-lingtu.bat
scripts/start-local.ps1
scripts/doctor-local.mjs
README_LOCAL_ZH.md
```

启动脚本必须：

1. 检查 Node.js、npm、PostgreSQL连接、环境变量、加密密钥和 storage 可写性。
2. 不输出密码、API Key 或完整敏感连接串。
3. 执行 Prisma generate 和安全的 migrate deploy，禁止 reset。
4. 检查端口 3000。
5. 启动成功后打开 `http://localhost:3000`。
6. 中文显示失败原因和处理建议。
7. 不修改或删除用户数据。

可增加 stop 脚本，但只能停止本项目启动的应用进程。

`README_LOCAL_ZH.md` 必须说明安装、环境配置、启动、Provider 三角色配置、创建项目、上传、识别、策划、逐张生成、首选图、ZIP、数据备份、升级和常见错误。

## 数据一致性

最终检查并修复：

- 删除主参考图时，选择下一张主图、更新封面、标记 ProductIdentity/ImagePlan 过期必须在项目锁和事务中完成。
- 没有剩余参考图时封面才能为空。
- 删除项目后，关联数据库记录与该项目 storage 目录都被安全清理，不影响其他项目。
- 文件清理失败不得静默声称成功。
- 服务重启后参考图、主图、产品身份证、五图策划、候选历史、首选图、ZIP 状态和角色绑定全部恢复。


## 最终端到端浏览器测试

新增：`npm run test:stage-8`

使用 Playwright、临时 PostgreSQL 和受控本地假 Provider，不调用收费模型。

假 Provider 必须分别模拟：

- 商品多图识别
- 五图策划
- 支持参考图的图片生成

测试要确认：

- 识别请求收到所选参考图。
- 策划请求收到产品身份证。
- 生图请求收到当前计划和参考图。
- 返回图片是真实可解码的 JPG/PNG/WebP。
- 页面、响应和日志不泄露密钥。
- 不得绕过正式 Provider adapter 和角色绑定直接写结果。

浏览器必须真实完成：

1. 首页创建中文项目。
2. 通过真实 `<input type="file">` 上传 JPG、PNG、WebP。
3. 设置主参考图和识别/生成选择。
4. 点击商品识别，验证中文产品身份证。
5. 点击生成五张策划，切换图1至图5。
6. 编辑并保存一条策划。
7. 对五条计划逐张生成测试图片。
8. 对其中一条强制重新生成，旧候选必须保留。
9. 查看候选分页。
10. 五条计划分别设置首选图。
11. 下载单图。
12. 下载 ZIP，解压后恰好五张且顺序正确。
13. 删除非首选候选。
14. 刷新和应用重启后恢复。
15. 删除测试项目，确认数据库和文件清理。

视口：

```text
1440×900
390×844
```

不得用直接 API 请求冒充用户主流程。

## 真实 Provider 历史回归

不得新增收费图片生成调用。

读取并验证已有 Stage 4、5、6、7、7.1 的真实 Gemini 和结果管理证据，确认阶段 8 修改没有破坏历史项目和 Provider adapter。

报告必须明确：

```text
阶段 8 新增收费图片生成调用：0
```

## 本地模式最终清理

`APP_MODE=local` 下：

- 只显示当前本地产品真正可用的导航。
- 不显示充值、积分、Stripe、登录和模板发布。
- `/api/upload` 保持 410。
- 不依赖 `MU_API_KEY`。
- 不出现旧英文品牌、英文 Local、乱码、10px 用户文字或大面积 `font-black`。
- Provider 技术品牌和模型 ID 可保留。
- 非本地模式代码不必删除，但不得影响本地流程。

## 隐私与错误验收

确认：

- API Key 只显示掩码。
- 不返回 encryptedApiKey、IV、auth tag、Authorization、数据库密码、本机绝对路径或图片 Base64。
- 普通候选接口不返回 promptSnapshot 全文或无必要 externalTaskId。
- 错误信息为中文并具有稳定 code。
- 浏览器控制台无阻断错误。
- 服务端日志不输出密钥前缀或环境变量名称。

## 最终 CI

CI 必须执行：

```text
npm ci
Prisma generate
完整 migrate deploy
test:stage-6-1
test:stage-6-2
test:stage-7
test:stage-7-1
test:stage-7-2
test:ui-text
test:stage-7-2-1
test:stage-8
npm audit --omit=dev --audit-level=high
lint
build
```

Playwright Chromium 必须真实执行。

生产依赖要求：

```text
critical = 0
high = 0
```

禁止 `npm audit fix --force`。

## 最终证据

创建：

```text
docs/stages/stage-8/STAGE_8_REPORT.md
docs/stages/stage-8/UI_ACCEPTANCE.md
docs/stages/stage-8/acceptance-summary.json
docs/stages/stage-8/Stage_8_Final_Release_Codex.md
FINAL_RELEASE_CHECKLIST.md
```

截图目录：

```text
docs/stages/stage-8/ui-acceptance/
```

至少保存：

```text
01-home-final.png
02-create-project.png
03-reference-upload.png
04-product-identity.png
05-five-plans.png
06-generation-candidate.png
07-five-preferred.png
08-zip-export.png
09-mobile-final.png
10-startup-doctor.png
```

更新 `PROJECT_CONTEXT.md`、`README.md`。

## 不做

不开发：

- 自动无确认连续调用五次收费 API
- 新 Provider
- Canva、ComfyUI、视频、AI 模特
- 多商品批处理
- SaaS 多租户、Stripe、积分
- 云端部署系统或移动 App

## 封存

Implementation commit：

```text
feat: finalize local ecommerce image studio workflow
```

报告提交：

```text
docs: seal stage 8 final release
```

标签：

```text
stage-8-final-release
```

推送分支和标签，不移动任何旧标签。

## 最终回复

```text
阶段 8 最终版本已完成并封存。

仓库：su2517108202-blip/amazon-product-studio
分支：codex/stage-8-final-release
Implementation commit：<完整 SHA>
最终封存提交：<完整 SHA>
标签：stage-8-final-release
标签指向：<完整 SHA>
Windows一键启动：通过 / 失败
完整浏览器流程：通过 / 失败
五图生成测试：通过 / 失败
首选图与ZIP：通过 / 失败
重启恢复：通过 / 失败
删除清理：通过 / 失败
production audit critical：
production audit high：
GitHub Actions：通过 / 失败
lint：通过 / 失败
build：通过 / 失败
新增收费图片生成调用：0 / 具体数量
阻塞问题：无 / 一句话
```

完成后停止。阶段 8 是当前项目最后一个正式阶段，不进入阶段 9。
