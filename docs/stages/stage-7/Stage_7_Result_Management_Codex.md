# 阶段 7：候选图历史、首选图与安全下载导出

> 直接将本文件交给 Codex 严格执行。  
> 本阶段建立在阶段 6.2 的封存提交上。  
> 本轮只完成生成结果管理，不开发批量生成五张图片，也不进入阶段 8。

---

# 一、当前封存基线

仓库：

```text
su2517108202-blip/amazon-product-studio
```

上游仓库：

```text
SamurAIGPT/amazon-product-studio
```

当前基线分支：

```text
codex/stage-6-2-auth-ci-fix
```

阶段 6.2 Implementation commit：

```text
c69a302bb6bd581e49c6f4e838fb81711e53943d
```

阶段 6.2 最终封存提交：

```text
46026762c4364dc7af5fbd81637d9bce6c64e640
```

阶段 6.2 标签：

```text
stage-6-2-auth-ci-fix
```

标签已确认指向：

```text
46026762c4364dc7af5fbd81637d9bce6c64e640
```

从该封存提交创建：

```text
codex/stage-7-result-management
```

创建前确认：

```bash
git status
git rev-parse HEAD
git tag --points-at HEAD
```

工作区必须干净，且 HEAD 必须是阶段 6.2 封存点。

---

# 二、当前已经具备的能力

项目当前已具备：

1. 本地单用户项目系统
2. 多商品参考图上传
3. 产品多图识别
4. ProductIdentity
5. BYOK Provider 中心
6. 三类模型角色
7. 一次生成 5 条 ImagePlan
8. 单条 ImagePlan 的真实单图生成
9. ImageGenerationRun
10. GeneratedImage 本地持久化
11. 同步和异步生成基础
12. fingerprint 复用
13. 强制重新生成并保留旧图
14. storage 用户与项目归属校验
15. 异步检查权限与幂等保护
16. GitHub Actions CI

阶段 6.2 已修复：

- 未认证异步检查
- 跨用户异步检查
- catch 路径越权
- CI 只触发旧分支的问题

本阶段不得破坏上述能力。

---

# 三、本阶段目标

本阶段只完成：

> 将每条 ImagePlan 的多次生成结果作为候选历史展示，允许选择首选图、下载单图、导出整套首选图，并安全管理候选版本。

完整流程：

```text
打开项目
→ 进入图1～图5中的某条策划
→ 查看该策划全部候选图
→ 查看每张图对应的生成记录
→ 将其中一张设为首选图
→ 下载单张候选图
→ 五个计划分别选择首选图
→ 下载整套首选图 ZIP
```

本阶段继续保持：

- 一次只生成当前一张
- 重新生成会产生新候选
- 旧候选不会被覆盖
- 失败 run 不会删除成功候选

本阶段完成后停止，不进入阶段 8。

---

# 四、本阶段必须做

## 4.1 候选图历史

每条 ImagePlan 展示全部未删除的 GeneratedImage。

至少显示：

- 图片
- 候选序号
- 是否首选
- Provider
- Model
- Protocol
- 生成时间
- 分辨率
- 宽高
- 文件大小
- GenerationRun 状态
- 是否使用 stale 输入
- 是否为强制重新生成产生的新版本

要求：

- 默认按最新在前。
- 支持分页或 cursor。
- 不一次返回项目全部大图数据。
- API 返回安全 storage URL，不返回绝对路径。
- 候选图跨刷新和服务重启恢复。
- 阶段 6 已有图片必须无迁移损坏地显示。

## 4.2 首选图

每个 ImagePlan 最多有一张首选图。

建议在 ImagePlan 增加：

```prisma
preferredGeneratedImageId String? @unique
```

并使用命名 relation 关联 GeneratedImage。

也可采用等价且更可靠的数据模型，但必须满足：

- 一条 ImagePlan 最多一个首选图。
- 首选图必须属于同一个 ImagePlan。
- 首选图必须属于同一个 Project。
- 不能选择已删除或不存在的图。
- 重新生成不会自动替换首选图。
- 删除候选图不能留下失效首选引用。

不要只在前端 localStorage 保存首选状态。

## 4.3 单图下载

允许下载任意有权限访问的 GeneratedImage。

要求：

- 服务端鉴权。
- 校验 Project 所有权。
- 校验 GeneratedImage 数据库记录。
- 通过服务端读取本地文件。
- 设置正确 Content-Type。
- 设置安全 Content-Disposition。
- 文件名经过清理，不能包含用户路径。
- 不暴露 storageKey、localPath 或绝对路径。
- 不使用任意客户端 URL 作为下载来源。

建议文件名：

```text
01-hero-candidate-03.jpg
```

中文计划名可用于显示，但下载文件名优先使用安全 ASCII 结构。

## 4.4 整套首选图 ZIP

项目级提供：

```text
下载整套首选图
```

默认规则：

- 项目必须存在 5 条 ImagePlan。
- 每条计划必须选定一张首选图。
- 缺少任一首选图时不生成不完整 ZIP。
- 页面明确显示缺少哪几张。
- ZIP 内只包含 5 张首选图。
- ZIP 内不得包含报告、密钥、路径、数据库信息。
- ZIP 不落地为永久文件，优先流式或临时生成后清理。
- 限制总文件数量和总字节数。
- 防止 ZIP 路径穿越。

ZIP 文件名：

```text
<safe-project-name>-preferred-images.zip
```

ZIP 内文件名：

```text
01-hero.<ext>
02-structure.<ext>
03-function.<ext>
04-scenario.<ext>
05-detail.<ext>
```

扩展名根据真实 MIME 确定。

---

# 五、候选删除与版本管理

本阶段允许删除非首选候选图。

规则：

1. 删除必须二次确认。
2. 首选图不能直接删除。
3. 删除首选图时返回：
   ```text
   PREFERRED_IMAGE_DELETE_BLOCKED
   ```
4. 用户先取消首选或选择另一张，再删除。
5. 删除时：
   - 校验当前用户和项目归属
   - 删除 GeneratedImage 数据库记录
   - 删除对应本地文件
6. 保留 ImageGenerationRun 审计记录。
7. run 没有图片后仍可保留 completed 状态和历史信息，不强制删除 run。
8. 文件删除失败时不得静默声称成功。
9. 数据库删除失败时不得先永久丢失唯一文件。
10. 使用可恢复顺序、临时重命名或补偿逻辑，尽量避免数据库与文件不一致。

本阶段不需要批量删除。

---

# 六、Prisma 数据结构

至少需要为首选图建立持久化关系。

建议修改：

```text
ImagePlan
GeneratedImage
```

可选增加：

```text
GeneratedImage.deletedAt
```

但第一版也可以采用物理删除，只要实现一致性保护。

若采用软删除：

- 所有列表、首选、下载和 ZIP 默认排除 deletedAt 非空记录。
- 清理本地文件的策略必须明确。
- 报告中说明。

建立正式 migration：

```text
prisma/migrations/<timestamp>_stage7_result_management/migration.sql
```

运行：

```bash
npx prisma generate --config prisma.config.ts
npx prisma migrate dev --config prisma.config.ts
```

并在临时空数据库运行完整 migration 链：

```bash
npx prisma migrate deploy --config prisma.config.ts
```

不得 reset 用户主数据库。

---

# 七、API 设计

建议新增：

```text
GET    /api/projects/[projectId]/image-plans/[planId]/generated-images
PATCH  /api/projects/[projectId]/image-plans/[planId]/preferred-image
DELETE /api/generated-images/[imageId]
GET    /api/generated-images/[imageId]/download
GET    /api/projects/[projectId]/exports/preferred-images
GET    /api/projects/[projectId]/generation-summary
```

可以采用等价路由，但职责必须清晰。

## 7.1 候选列表

返回：

```json
{
  "items": [],
  "nextCursor": null,
  "preferredGeneratedImageId": null,
  "stats": {
    "candidateCount": 0,
    "completedRunCount": 0,
    "failedRunCount": 0
  }
}
```

候选项可包含脱敏后的 run 摘要，不返回：

- promptSnapshot 全文
- externalTaskId
- API Key
- Authorization
- 绝对路径
- 图片 Base64

## 7.2 设置首选图

请求：

```json
{
  "generatedImageId": ""
}
```

支持清空：

```json
{
  "generatedImageId": null
}
```

必须在事务中校验：

- Project 属于当前用户
- ImagePlan 属于 Project
- GeneratedImage 属于同一 Project 和 ImagePlan
- GeneratedImage 文件记录有效

错误码：

```text
GENERATED_IMAGE_NOT_FOUND
IMAGE_PLAN_NOT_FOUND
IMAGE_NOT_IN_PLAN
PREFERRED_IMAGE_UPDATE_FAILED
```

## 7.3 删除候选

必须使用数据库记录决定文件位置，不接受客户端 storageKey。

错误码：

```text
GENERATED_IMAGE_NOT_FOUND
PREFERRED_IMAGE_DELETE_BLOCKED
GENERATED_FILE_NOT_FOUND
GENERATED_FILE_DELETE_FAILED
```

## 7.4 单图下载

- 所有权校验与 storage API 同级严格。
- 不通过 302 暴露内部 storage URL。
- 直接返回文件响应。
- 加：
  ```text
  X-Content-Type-Options: nosniff
  ```
- Content-Disposition 使用安全文件名。

## 7.5 ZIP 导出

导出前在服务端一次性验证：

- 当前用户
- Project
- 5 条 ImagePlan
- 每条首选图
- 每个数据库记录
- 每个本地文件
- MIME
- 文件大小

验证全部通过后再开始响应。

不要生成到一半才发现缺图。

---

# 八、前端 Studio

## 8.1 当前计划候选区

在每条 ImagePlan 的图片生成区域下方增加：

```text
候选图历史
```

候选卡片显示：

- 大图预览
- 候选编号
- 首选标记
- 生成时间
- Provider / Model
- 分辨率
- 文件大小
- 下载
- 设为首选
- 删除

当前最新图片仍可在顶部突出显示，但不得隐藏旧候选。

## 8.2 首选图交互

按钮：

```text
设为首选
已是首选
取消首选
```

切换后：

- 即时更新 UI
- 服务端保存成功后提示
- 失败时恢复原状态
- 刷新后仍正确

不能用乐观更新导致错误状态长期存在。

## 8.3 五张进度

Studio 顶部显示：

```text
主图生成：3/5
首选图：2/5
```

分别表示：

- 有至少一张成功候选的计划数量
- 已选择首选图的计划数量

五个计划导航增加：

- 候选数量
- 首选状态
- processing 状态
- failed 状态摘要

## 8.4 项目级导出

按钮：

```text
下载整套首选图
```

未达到 5/5 时禁用，并显示：

```text
还缺：图2 核心结构、图5 细节理由
```

达到 5/5 后可下载 ZIP。

## 8.5 生成按钮保留

阶段 6 的：

```text
生成当前图片
强制重新生成
```

继续可用。

每次新成功生成：

- 候选列表出现新版本
- 不自动改变已有首选图
- 若当前计划从未设置首选，不要擅自自动选择，除非产品明确采用“首次生成自动设首选”规则

本阶段默认：

```text
首次成功生成不自动设首选
```

让用户明确选择。

---

# 九、异步任务 UI 恢复

阶段 6 已支持异步轮询基础。

本阶段补齐候选历史页面中的恢复体验：

- 页面打开时如果当前计划存在 processing async run，恢复轮询。
- 只轮询当前项目、当前用户拥有的 run。
- 页面隐藏或离开项目后停止高频轮询。
- completed/failed 后停止。
- 不创建新 run。
- 不自动重新提交生成。
- 完成后刷新候选列表。
- 轮询使用阶段 6.2 已加固的权限接口。

不要增加 Webhook 强依赖。

---

# 十、安全要求

严禁：

- 下载接口接受任意文件路径
- ZIP 名称包含 `../`、反斜杠或绝对路径
- 返回 API Key
- 返回 encryptedApiKey、IV、auth tag
- 返回 Authorization Header
- 返回图片 Base64
- 返回 promptSnapshot 全文
- 返回 externalTaskId 给无必要的候选列表
- 跨用户读取候选图
- 跨用户设置首选图
- 跨用户下载
- 跨用户删除
- 跨用户导出 ZIP
- 删除首选图后留下悬空引用
- ZIP 包含 storage 目录结构

所有写操作必须服务端重新校验归属，不能只依赖前端传来的 projectId。

---

# 十一、错误码

至少支持：

```text
PROJECT_NOT_FOUND
IMAGE_PLAN_NOT_FOUND
GENERATED_IMAGE_NOT_FOUND
IMAGE_NOT_IN_PLAN
PREFERRED_IMAGE_UPDATE_FAILED
PREFERRED_IMAGE_DELETE_BLOCKED
GENERATED_FILE_NOT_FOUND
GENERATED_FILE_DELETE_FAILED
DOWNLOAD_FAILED
PREFERRED_SET_INCOMPLETE
PREFERRED_FILE_MISSING
ZIP_EXPORT_FAILED
UNAUTHORIZED
```

用户界面显示中文可理解提示。

服务端返回稳定 code。

---

# 十二、运行时测试

必须增加真正调用 API 的运行时测试，不得只用源码字符串断言。

至少测试：

## 所有权

1. 用户 A 不能列出用户 B 候选。
2. 用户 A 不能设置用户 B 首选。
3. 用户 A 不能下载用户 B 图片。
4. 用户 A 不能删除用户 B 图片。
5. 用户 A 不能导出用户 B ZIP。
6. 未认证请求被拒绝。

## 首选图

7. 设置首选成功。
8. 更换首选成功。
9. 清空首选成功。
10. 跨计划图片不能设为首选。
11. 跨项目图片不能设为首选。
12. 刷新后首选恢复。
13. 服务重启后首选恢复。

## 候选和删除

14. 多次生成记录全部显示。
15. 删除非首选成功。
16. 删除首选被阻止。
17. 删除后数据库记录与本地文件一致。
18. 删除一个候选不影响其他候选。
19. 删除候选不删除 ImageGenerationRun。
20. 文件缺失时返回安全错误。

## 下载和 ZIP

21. 单图下载 Content-Type 正确。
22. 单图下载 Content-Disposition 安全。
23. 下载内容 SHA-256 与数据库一致。
24. 5/5 首选时 ZIP 包含恰好 5 张。
25. ZIP 文件名顺序正确。
26. ZIP 无绝对路径和路径穿越。
27. 缺少首选时 ZIP 被拒绝并指出缺失计划。
28. 首选文件缺失时 ZIP 不生成半成品。
29. ZIP 内文件内容与对应 GeneratedImage 一致。

## 回归

30. 阶段 6 单图生成仍正常。
31. fingerprint 复用仍正常。
32. 强制重新生成仍保留旧候选。
33. 失败 run 不影响候选。
34. 异步完成后候选列表更新。
35. completed/failed run 不重复轮询。

---

# 十三、CI

现有 CI 应已覆盖：

```yaml
codex/**
main
pull_request
```

阶段 7 增加：

```text
npm run test:stage-7
```

CI 顺序至少包含：

```text
npm ci
Prisma generate
完整 migration deploy
Stage 6.1 checks
Stage 6.2 runtime checks
Stage 7 runtime checks
lint
build
```

当前阶段分支推送后 GitHub Actions 必须真实通过。

不使用真实 API Key。

不调用收费图片 Provider。

---

# 十四、质量要求

必须通过：

```bash
npx prisma generate --config prisma.config.ts
npx prisma migrate dev --config prisma.config.ts
npm run test:stage-6-1
npm run test:stage-6-2
npm run test:stage-7
npm run lint
npm run build
```

临时空数据库完整 migration：

```bash
npx prisma migrate deploy --config prisma.config.ts
```

保留现有 6 个 `<img>` warning，不在本阶段专项重构。

现有 npm audit 风险继续记录，不执行：

```bash
npm audit fix --force
```

---

# 十五、本阶段不要做

不要开发：

- 一键批量生成全部 5 张
- 自动连续调用 5 次图片 API
- 自动重试收费生成
- Canva 编辑器
- ComfyUI
- 视频生成
- AI 模特
- 多商品批处理
- Stripe
- 积分
- SaaS 多租户
- 阶段 8 全流程最终改版

---

# 十六、真实验收

本阶段不要求再次调用收费图片 API。

使用阶段 6 已保存的真实 GeneratedImage，并可通过受控本地测试数据补充多候选。

人工验收至少完成：

1. 打开已有真实生成项目。
2. 图 1 能看到两个历史候选。
3. 设置其中一张为首选。
4. 刷新后首选恢复。
5. 服务重启后首选恢复。
6. 下载单图成功。
7. 为五条计划准备安全测试候选并分别设置首选。
8. 下载 ZIP。
9. 解压确认恰好五张，顺序和文件名正确。
10. 删除一个非首选候选。
11. 确认首选候选无法直接删除。
12. 旧 ImageGenerationRun 仍存在。
13. 无密钥、路径或 Base64 泄露。

测试候选可以由本地固定图片复制产生，但报告必须明确：

```text
哪些是阶段 6 的真实 Provider 生成图
哪些是阶段 7 的受控本地测试候选
```

不得把本地测试候选冒充真实模型生成。

---

# 十七、Git 提交与封存

先提交业务实现：

```text
feat: add generated image history and preferred exports
```

记录该完整 SHA 为：

```text
Implementation commit
```

然后提交报告、验收摘要和项目上下文：

```text
docs: seal stage 7 result management
```

创建标签：

```text
stage-7-result-management
```

不得移动旧标签：

```text
stage-6-image-generation
stage-6-1-hardening
stage-6-2-auth-ci-fix
```

推送：

```text
origin/codex/stage-7-result-management
stage-7-result-management
```

---

# 十八、阶段报告

创建：

```text
docs/stages/stage-7/STAGE_7_REPORT.md
docs/stages/stage-7/acceptance-summary.json
docs/stages/stage-7/Stage_7_Result_Management_Codex.md
```

更新：

```text
PROJECT_CONTEXT.md
```

报告至少包含：

1. 基线封存提交
2. Implementation commit
3. Seal tag
4. Prisma 变化
5. migration 路径
6. 候选列表 API
7. 首选图 API
8. 单图下载 API
9. ZIP 导出 API
10. 删除策略
11. 所有权测试
12. 首选图持久化测试
13. 下载与 ZIP 内容测试
14. 刷新和重启恢复
15. 阶段 6 回归
16. 真实生成图与本地测试候选的区分
17. lint/build
18. GitHub Actions
19. 已知问题
20. 阶段 8 前置条件

不得包含：

- API Key
- 数据库密码
- Authorization Header
- 图片 Base64
- 本机绝对路径
- 代理凭据

---

# 十九、最终回复格式

完成后只回复：

```text
阶段 7 已完成并停止。

仓库：su2517108202-blip/amazon-product-studio
分支：codex/stage-7-result-management
Implementation commit：<完整 SHA>
最终封存提交：<完整 SHA>
标签：stage-7-result-management
标签指向：<完整 SHA>
报告：docs/stages/stage-7/STAGE_7_REPORT.md
GitHub Actions：通过 / 失败
lint：通过 / 失败
build：通过 / 失败
阻塞问题：无 / 一句话
```

完成后停止，不进入阶段 8。
