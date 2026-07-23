# 阶段 6.1：图片生成安全与异步幂等加固

> 直接将本文件上传给 Codex。
> 本轮不是阶段 7，不增加候选图、首选图或下载功能。
> 只修复阶段 6 审查发现的问题，完成后推送 GitHub 并停止。

## 一、当前状态

仓库：

```text
su2517108202-blip/amazon-product-studio
```

阶段 6 分支：

```text
codex/stage-6-image-generation
```

阶段 6 提交：

```text
ef818d0fd063c94d3c1cf251ef4481dd05daaf9c
```

阶段 6 标签：

```text
stage-6-image-generation
```

阶段 6 的 Gemini 真实单图生成闭环已通过，但代码审查发现若干安全、幂等和 Provider 一致性问题。

本轮从阶段 6 提交创建：

```text
codex/stage-6-1-hardening
```

完成后停止，不进入阶段 7。

## 二、必须修复的问题

### 1. Gemini API Key 不得放在 URL 查询参数

当前 Gemini 的连接测试、模型列表、商品识别和策划请求使用：

```text
?key=<API_KEY>
```

这可能被代理、访问日志或错误监控记录。

统一改为：

```http
x-goog-api-key: <API_KEY>
```

要求：

- `testConnection`
- `listModels`
- `analyzeProduct`
- `createImagePlan`
- `generateImage`

全部使用 Header。

URL 中不得再出现真实 API Key。

增加测试，确认发出的 URL 不含 Key。

### 2. 修复 storage 路径边界判断

当前 `resolveStoragePath()` 使用：

```js
target.startsWith(storageRoot)
```

这是不安全的前缀判断，类似 `storage-evil` 仍可能通过。

改用：

```js
const relative = path.relative(storageRoot, target)
```

仅当满足以下条件才允许：

- `relative` 不以 `..` 开头
- `relative` 不是绝对路径
- 目标仍位于 storageRoot 内
- 不包含越界路径

同时：

- 处理 Windows 和 POSIX 路径
- 增加 encoded traversal 测试
- 增加 sibling-prefix 测试
- 错误响应不得回显本机绝对路径

### 3. storage API 增加用户与项目归属校验

当前 `/api/storage/[...path]` 没有调用 `requireCurrentUser()`。

必须：

1. 要求当前用户。
2. 路径只能符合：
   ```text
   projects/<projectId>/references/<file>
   projects/<projectId>/generations/<runId>/<file>
   ```
3. 查询 Project，确认 `project.userId === currentUser.id`。
4. references 文件应确认对应 `ReferenceImage.storageKey` 存在。
5. generations 文件应确认对应 `GeneratedImage.storageKey` 存在。
6. 禁止仅凭知道 URL 就读取其他项目文件。
7. 不存在、无权限和非法路径均返回安全错误，不泄露绝对路径。

保留本地单用户模式兼容。

### 4. 修复异步完成的并发重复落库

当前 `persistGeneratedImages()` 是：

```text
先 findMany
再 create
```

多个并发轮询可能同时通过检查，生成重复 `GeneratedImage`。

新增：

```text
GeneratedImage.outputIndex
```

建议：

```prisma
outputIndex Int @default(0)
@@unique([generationRunId, outputIndex])
```

阶段 6 当前只保存第 1 张：

```text
outputIndex = 0
```

保存逻辑改为事务内 upsert 或 create + 唯一冲突后读取。

要求：

- 两个并发 check 请求只产生一条 index 0 图片记录。
- 不产生孤立重复文件。
- 如果唯一冲突发生，删除本次多余临时文件或避免先写文件。
- 为阶段 7 多候选预留 outputIndex 1、2、3。

创建正式 Prisma migration。

### 5. 修复异步 run 永久 processing

当前 async check 抛出异常时只返回错误，run 可能长期保持 `processing`。

新增必要字段，建议：

```text
checkAttempts
lastCheckedAt
expiresAt
```

行为：

- 提交异步任务时设置合理 `expiresAt`。
- 每次 check 更新 `checkAttempts` 和 `lastCheckedAt`。
- 超过 expiresAt：
  ```text
  status = failed
  errorCode = ASYNC_TASK_EXPIRED
  completedAt = now
  ```
- 明确终止性错误：
  - INVALID_API_KEY
  - MODEL_NOT_FOUND
  - INSUFFICIENT_QUOTA
  - ASYNC_TASK_FAILED
  应将 run 标记 failed。
- 可恢复的短暂网络错误/超时可以保留 processing，但必须记录安全摘要和次数。
- 达到最大检查次数后标记 failed。
- completed / failed run 不再请求上游。

增加受控并发和过期测试。

### 6. 图片生成协议必须明确是否真正使用参考图

当前：

- `openai-images`
- `doubao-image`
- `generic-async-image`

可能只发送 prompt，忽略商品参考图，但系统会让用户以为参考图已经参与。

必须建立协议能力：

```text
supportsReferenceImages
```

规则：

#### Gemini

```text
gemini-native-image
supportsReferenceImages = true
```

#### OpenAI

```text
openai-image-edit
supportsReferenceImages = true
openai-images
supportsReferenceImages = false
```

#### OpenAI Compatible

由协议明确：

```text
openai-image-edit = true
openai-images = false
generic-async-image = 只有协议真实传输参考图时才为 true
```

#### Doubao

只有实现真实参考图协议时才标记 true。

没有实现时：

- 不得假装使用参考图
- 不得用于默认电商商品图生成
- 返回：
  ```text
  REFERENCE_IMAGES_UNSUPPORTED
  ```
- 或在设置页和生成前明确标注“纯文生图，不保证商品一致性”，并要求二次确认

本项目默认生成流程要求主参考图，因此默认只能绑定或执行：

```text
supportsReferenceImages = true
```

阶段 6.1 不要求把所有第三方接口都做完，但必须诚实限制未实现协议。

### 7. generic async 协议不能假装通用兼容

当前 generic async 固定：

```text
POST generations
GET generations/<taskId>
```

这只是一个约定，不是真正通用标准。

要求：

- 在 UI 和文档中标记为“约定协议”
- 只有明确兼容该请求/响应结构的服务才能使用
- 增加响应 schema 校验
- 缺 externalTaskId 立即失败
- completed 但没有图片时返回 INVALID_IMAGE_RESPONSE
- 不允许未知响应字段被猜测为成功
- 未真实支持参考图时不能用于默认电商工作流

### 8. 修正文档元数据

更新：

```text
PROJECT_CONTEXT.md
docs/stages/stage-6/STAGE_6_REPORT.md
docs/stages/stage-6/acceptance-summary.json
```

修正：

- Stage 6 commit 明确写：
  ```text
  ef818d0fd063c94d3c1cf251ef4481dd05daaf9c
  ```
- 当前仓库写：
  ```text
  su2517108202-blip/amazon-product-studio
  ```
- 上游仓库单独写：
  ```text
  SamurAIGPT/amazon-product-studio
  ```
- 不再写 `sealed by tag` 代替提交号

只保留一个 canonical Stage 6 报告：

```text
docs/stages/stage-6/STAGE_6_REPORT.md
```

根目录 `STAGE_6_REPORT.md`：

- 删除，或
- 明确标记为指向 canonical 报告的简短索引

不要保留两份可独立漂移的完整报告。

### 9. 增加 GitHub Actions CI

新增：

```text
.github/workflows/ci.yml
```

至少执行：

```text
npm ci
npx prisma generate --config prisma.config.ts
npm run lint
npm run build
```

若 build 需要环境变量：

- 使用明确的非敏感占位值
- 不使用真实密钥
- 不连接用户本地数据库

可增加 PostgreSQL service 做空数据库 migration：

```text
npx prisma migrate deploy --config prisma.config.ts
```

CI 必须在当前分支推送后实际通过。

## 三、测试要求

至少测试：

1. Gemini 请求 URL 中没有 API Key。
2. Gemini Header 有 `x-goog-api-key`，但测试日志不得显示完整值。
3. storage 正常图片读取。
4. storage 未登录/无当前用户被拒绝。
5. storage 其他项目文件被拒绝。
6. `../` 路径被拒绝。
7. URL 编码 traversal 被拒绝。
8. sibling-prefix 路径被拒绝。
9. storage 错误不回显绝对路径。
10. 两个并发 async check 只生成一条 outputIndex 0。
11. 异步任务过期后变为 failed。
12. 终止性 async 错误变为 failed。
13. 临时网络错误不会创建新 run。
14. completed/failed 不再检查上游。
15. `openai-images` 被识别为不支持参考图。
16. `openai-image-edit` 被识别为支持参考图。
17. 未实现参考图的 Doubao 协议不得默认生成。
18. generic async 响应缺 task id 被拒绝。
19. generic async completed 无图片被拒绝。
20. 真实 Gemini 单图生成仍能成功。
21. 旧 GeneratedImage 数据可正常读取。
22. Prisma migration 成功。
23. 空数据库完整 migration 成功。
24. lint 通过。
25. build 通过。
26. GitHub Actions 通过。

## 四、本轮不要做

不要开发：

- 候选图历史 UI
- 首选图
- 下载
- ZIP
- 批量生成 5 张
- 删除历史管理
- Canva
- ComfyUI
- 视频
- AI 模特
- 阶段 7 功能

## 五、Git 封存与推送

完成后提交：

```text
fix: harden image generation storage and async handling
```

创建标签：

```text
stage-6-1-hardening
```

推送：

```text
origin/codex/stage-6-1-hardening
stage-6-1-hardening
```

不要移动或覆盖已经发布的：

```text
stage-6-image-generation
```

## 六、报告

创建：

```text
docs/stages/stage-6-1/STAGE_6_1_REPORT.md
docs/stages/stage-6-1/acceptance-summary.json
```

更新：

```text
PROJECT_CONTEXT.md
```

报告包含：

- 分支
- 完整提交 SHA
- 标签
- 修复问题
- migration
- storage 权限测试
- traversal 测试
- async 并发测试
- async 过期测试
- Provider 参考图能力矩阵
- Gemini 回归测试
- lint/build
- GitHub Actions 状态
- 尚未解决问题

不得包含任何密钥或本机绝对敏感路径。

## 七、Codex 最终回复

不要在聊天粘贴长报告，只回复：

```text
阶段 6.1 已完成并停止。

仓库：su2517108202-blip/amazon-product-studio
分支：codex/stage-6-1-hardening
提交：<完整 SHA>
标签：stage-6-1-hardening
报告：docs/stages/stage-6-1/STAGE_6_1_REPORT.md
上下文：PROJECT_CONTEXT.md
GitHub Actions：通过 / 失败
lint：通过 / 失败
build：通过 / 失败
阻塞问题：无 / 一句话说明
```

完成后停止，不进入阶段 7。
