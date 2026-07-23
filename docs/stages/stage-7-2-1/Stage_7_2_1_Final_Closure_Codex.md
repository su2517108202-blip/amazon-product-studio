# 阶段 7.2.1：阶段 8 前最终闭环修复

> 本轮只修复阶段 7.2 复核发现的验收缺口和回归问题。完成后停止，不进入阶段 8。

## 一、基线

仓库：`su2517108202-blip/amazon-product-studio`

基线标签：`stage-7-2-pre-stage-8-remediation`

基线提交：`5cd997bc31b9b78504d1596f73cc4c85be9851ac`

从该提交创建：`codex/stage-7-2-1-final-closure`

不得移动任何旧标签。

## 二、CI 必须执行阶段 7.2 测试

当前 `.github/workflows/ci.yml` 没有执行：

- `npm run test:stage-7-2`
- `npm run test:ui-text`

修改 CI，至少依次执行：

```text
npm run test:stage-6-1
npm run test:stage-6-2
npm run test:stage-7
npm run test:stage-7-1
npm run test:stage-7-2
npm run test:ui-text
npm audit --omit=dev --audit-level=high
npm run lint
npm run build
```

当前分支推送后必须真实触发；Actions job steps 中必须能看到阶段 7.2 和 UI 文案测试。

## 三、真正执行完整像素解码

当前 `validateReferenceImageContent()` 只调用 `sharp(...).metadata()`，不能仅凭 metadata 声称完成完整像素解码。

要求：

1. 保留 magic bytes 和 metadata 校验。
2. 增加会强制解码像素的 sharp pipeline，例如：
   ```js
   await sharp(buffer, {
     failOn: "warning",
     limitInputPixels: MAX_REFERENCE_IMAGE_PIXELS
   }).rotate().raw().toBuffer();
   ```
3. 最大像素数建议不超过 25,000,000。
4. 不保存 raw 结果。
5. 损坏但头部和尺寸仍有效的 PNG、JPEG、WebP 必须拒绝。
6. 返回 `INVALID_IMAGE_CONTENT`，不暴露 libvips 原始错误。

测试不能只把文件截断到 16 字节；必须增加像素数据中部截断的 PNG、JPEG、WebP 样本。


## 四、恢复字体可读性

阶段 7.2 恢复工作台时重新带回了大量 `text-[10px]` 和 `font-black`。

要求：

- `ProjectStudioClient.js` 用户可见信息不得使用 `text-[10px]`。
- 状态标签最低 12px，正文和候选信息最低 13px，按钮最低 14px。
- 页面标题用 `font-bold`，模块标题和按钮用 `font-semibold`，状态用 `font-medium` 或 `font-semibold`。
- 不依赖全局 CSS 掩盖源码中的小字号。
- `test:ui-text` 增加断言：
  - 主应用源码无 `text-[10px]`
  - 工作台不存在过度 `font-black`
  - 状态标签不低于 12px
- 桌面 `1440×900`、移动 `390×844` 重新截图验收。

## 五、修复文件选择器格式不一致

当前前端允许 `image/gif`，后端只允许 JPG、PNG、WebP。

将文件输入改为：

```text
image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp
```

不得继续展示 GIF 可上传。增加组件或浏览器测试。

## 六、修复候选分页末页判断

当前返回数量刚好等于 limit 时仍会产生 `nextCursor`。

改为：

1. 查询 `limit + 1` 条。
2. `hasMore = rows.length > limit`。
3. 只返回前 `limit` 条。
4. 仅当 `hasMore` 时返回 cursor。

测试：

- 24 个候选：第二页后 `nextCursor = null`
- 25 个候选：第三页 1 条
- 无重复、无跳项


## 七、补齐真实浏览器文件上传

阶段 7.2 报告承认没有通过浏览器文件输入上传，而是直接调用 API。

本轮必须使用 Playwright 或等价浏览器 E2E，通过真实 `<input type="file">` 执行 `setInputFiles()`：

1. 从首页创建项目。
2. 打开工作台。
3. 通过页面上传 JPG、PNG、WebP。
4. 看到上传中状态和成功提示。
5. 缩略图立即出现。
6. 第一张成为主图。
7. 刷新后仍存在。
8. 选择器不包含 GIF。
9. Network 命中 `POST /api/projects/[projectId]/reference-images`。
10. 不得用直接 fetch 冒充浏览器上传验收。

Playwright 只能作为 devDependency。

## 八、修正文档字段

`acceptance-summary.json` 中：

```json
"remainingEnglishUserLabels": true
```

语义与报告冲突。改为：

```json
"englishUserLabelsRemoved": true
```

或：

```json
"remainingEnglishUserLabels": false
```

## 九、主图切换原子性

阶段 7.2 已加入单主图唯一索引，但“设置主图”仍需保证事务一致性。

使用项目 advisory lock 和事务完成：

1. 用户与项目归属校验。
2. 取消旧主图。
3. 设置新主图。
4. 更新 coverImageUrl。
5. 标记 ProductIdentity 和 ImagePlan stale。

任何失败不得留下 0 张主图或错误封面。

增加并发切换主图测试，最终必须恰好一个主图，封面指向该主图。


## 十、验证

必须通过：

```text
npm ci
Prisma generate
空数据库完整 migrate deploy
test:stage-6-1
test:stage-6-2
test:stage-7
test:stage-7-1
test:stage-7-2
test:ui-text
真实 Playwright 上传 E2E
npm audit --omit=dev --audit-level=high
lint
build
GitHub Actions
```

不触发新的收费图片生成。

## 十一、报告与封存

创建：

```text
docs/stages/stage-7-2-1/STAGE_7_2_1_REPORT.md
docs/stages/stage-7-2-1/UI_ACCEPTANCE.md
docs/stages/stage-7-2-1/acceptance-summary.json
docs/stages/stage-7-2-1/Stage_7_2_1_Final_Closure_Codex.md
```

截图目录：

```text
docs/stages/stage-7-2-1/ui-acceptance/
```

至少保存：

```text
01-upload-file-input.png
02-upload-progress.png
03-upload-thumbnails.png
04-readable-candidates.png
05-mobile-readable.png
```

Implementation commit：

```text
fix: close stage 7.2 CI decode and UI gaps
```

标签：

```text
stage-7-2-1-final-closure
```

完成后停止，不进入阶段 8。

## 十二、最终回复

```text
阶段 7.2.1 已完成并停止。

仓库：su2517108202-blip/amazon-product-studio
分支：codex/stage-7-2-1-final-closure
Implementation commit：<完整 SHA>
最终封存提交：<完整 SHA>
标签：stage-7-2-1-final-closure
标签指向：<完整 SHA>
CI包含stage-7-2测试：通过 / 失败
真实像素解码：通过 / 失败
真实浏览器文件上传：通过 / 失败
字体可读性：通过 / 失败
GIF选择器修复：通过 / 失败
候选分页末页：通过 / 失败
主图切换原子性：通过 / 失败
production audit critical：
production audit high：
GitHub Actions：通过 / 失败
lint：通过 / 失败
build：通过 / 失败
阻塞问题：无 / 一句话
```
