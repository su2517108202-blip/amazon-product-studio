# Stage 7.1 CN Upload Fix Instruction Source

## Scope

从 `stage-7-result-management` 封存提交创建 `codex/stage-7-1-cn-upload-fix`。

本轮只完成：

- 面向用户的内容全部简体中文化。
- 修复真实图片上传失败问题。
- 增加全局字体、字号、字重和行高可读性改造。

不得进入阶段 8。

## Chinese UI Requirements

所有面向用户的界面必须使用简体中文，包括首页、新建项目、项目工作台、Provider 设置页、商品识别、产品身份证、五张主图策划、图片生成、候选图历史、首选图、下载与 ZIP、加载状态、成功提示、错误提示、确认弹窗、空状态和移动端页面。

技术值允许保持原文：OpenAI、Gemini、DeepSeek、Doubao、模型 ID、API、JSON、ZIP、MIME、HTTP、数据库字段和协议内部 ID。

## Chinese AI Output Requirements

商品识别、五图策划和最终生图提示词必须明确要求自然语言输出使用简体中文，JSON 字段名继续保持英文。

增加自动测试，确认中文项目不会返回整段英文策划。

旧 Stage 4 英文测试数据不自动篡改。额外创建中文测试项目，通过真实页面完成识别和策划，验收时不得触发新的收费图片生成。

## Upload Requirements

通过真实浏览器操作复现和验收：

- 单张 JPG
- 单张 PNG
- 单张 WebP
- 中文文件名
- 带空格文件名
- 一次上传 4 张
- 超过数量限制
- 非图片文件
- 空文件
- 超大文件

上传成功后立即显示缩略图，第一张图自动设为主参考图，刷新和服务重启后仍存在。失败必须显示具体中文错误，不返回本机绝对路径或原始系统错误。

每张图片大小限制为 12MB，只允许 `image/jpeg`、`image/png`、`image/webp`，并校验文件内容签名。批量上传中任一文件不合格时，不得留下半批数据库记录或孤立文件。上传写入失败时必须清理已经创建的临时文件。`storage` 目录不存在时自动创建。上传接口继续校验当前用户和项目归属。

## Readability Requirements

全局字体栈：

```text
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
"PingFang SC",
"Microsoft YaHei",
"Noto Sans CJK SC",
"Noto Sans SC",
Arial,
sans-serif
```

桌面端主标题 24px 至 28px，模块标题 18px 至 20px，卡片标题 16px，正文和表单 15px 至 16px，按钮/输入框至少 14px，辅助说明至少 13px，状态标签至少 12px。

移动端正文和按钮最低 14px，输入框最低 16px，页面标题最低 22px，点击区域高度最低 42px。减少 `font-black`，正文行高至少 1.5，长说明和策划内容行高 1.6。

## Acceptance Artifacts

必须创建：

- `docs/stages/stage-7-1/UI_ACCEPTANCE.md`
- `docs/stages/stage-7-1/STAGE_7_1_REPORT.md`
- `docs/stages/stage-7-1/acceptance-summary.json`
- `docs/stages/stage-7-1/ui-acceptance/`

完成后创建标签 `stage-7-1-cn-upload-fix`，推送分支和标签，停止等待审查。
