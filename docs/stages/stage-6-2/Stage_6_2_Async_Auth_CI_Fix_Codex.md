# 阶段 6.2：异步检查权限修复与 CI 封存规范

> 本轮是阶段 6 的最后一个小修复，不进入阶段 7。
> 直接将本文件交给 Codex 执行。

## 当前基线

仓库：

```text
su2517108202-blip/amazon-product-studio
```

基线分支：

```text
codex/stage-6-1-hardening
```

基线封存提交及标签：

```text
3b1b119ff89dca74a68433fe85b9981745e5baa8
stage-6-1-hardening
```

从该提交创建：

```text
codex/stage-6-2-auth-ci-fix
```

完成后停止，不进入阶段 7。

## 一、修复异步检查接口的权限绕过

文件：

```text
src/app/api/image-generations/[generationRunId]/check/route.js
```

当前问题：

- `try` 中通过 `requireCurrentUser()` 和项目归属查询保护 run。
- `catch` 中又使用仅按 `id` 的 `findUnique()` 查询 run。
- 如果身份校验失败，或在完成所有权验证之前发生异常，`catch` 仍可能读取、更新并返回一个已知 ID 的 processing async run。

修复要求：

1. 所有读取、返回或修改 run 的路径，必须先确认当前用户和项目归属。
2. `catch` 中禁止仅按 `id` 查询 run。
3. 如果 `requireCurrentUser()` 失败：
   - 返回安全 401
   - 不查询 run
   - 不修改 run
   - 不调用上游
4. 如果 run 不属于当前用户：
   - 返回 404 或 403
   - 不泄露 run 是否存在
5. 只有已确认归属的 run 才允许：
   - 增加 checkAttempts
   - 更新 errorCode
   - 标记 failed
   - 调用 Provider
6. completed / failed 的短路行为继续保留。

建议将 `generationRunId`、`userId`、`ownedRunId` 放在 try/catch 外部；catch 只处理已经建立归属关系的 run。

## 二、新增运行时权限测试

现有 `scripts/stage-6-1-acceptance.mjs` 主要是源码字符串检查，不能代替运行时权限测试。

至少覆盖：

1. 未认证请求：
   - 返回 401
   - run 不变化
   - checkAttempts 不变化
   - 不调用上游

2. 用户 A 请求用户 B 的 processing async run：
   - 返回 404 或 403
   - run 不变化
   - 不调用上游
   - 不返回 provider、model、externalTaskId 等内容

3. 合法所有者请求 processing run：
   - 原有流程正常

4. 合法所有者请求 completed / failed run：
   - 不调用上游

5. Provider 抛出终止性错误：
   - 只能更新合法所有者的 run

测试应调用路由或抽取后的真实权限逻辑，不得只做 `file.includes()` 断言。

## 三、修复 GitHub Actions 触发范围

当前 `.github/workflows/ci.yml` 只在：

```yaml
codex/stage-6-1-hardening
```

触发。

改为：

```yaml
on:
  push:
    branches:
      - "codex/**"
      - main
  pull_request:
```

要求：

- 当前 6.2 分支推送后真实触发 CI。
- CI 继续执行 npm ci、Prisma generate、migration deploy、阶段测试、lint、build。
- 不使用真实 API Key。
- 不连接用户本地数据库。

## 四、统一提交记录语义

不要再强迫报告文件写入“包含报告本身的最终提交 SHA”，这会形成 Git 自引用问题。

统一使用：

```text
Implementation commit：实际业务代码完成提交
Seal tag：阶段封存标签
Seal tag target：只在最终聊天回复中报告
```

更新阶段 6.1 文档：

```text
PROJECT_CONTEXT.md
docs/stages/stage-6-1/STAGE_6_1_REPORT.md
docs/stages/stage-6-1/acceptance-summary.json
```

正确记录：

```text
Implementation commit:
04bc277be6442578fd5d4c31e73349faecdb2c82

Seal tag:
stage-6-1-hardening

Seal tag target:
3b1b119ff89dca74a68433fe85b9981745e5baa8
```

阶段 6.2 报告记录：

```text
Base seal commit:
3b1b119ff89dca74a68433fe85b9981745e5baa8

Implementation commit:
<业务修复提交 SHA>

Seal tag:
stage-6-2-auth-ci-fix
```

## 五、范围限制

不要开发：

- 候选图历史
- 首选图
- 下载
- ZIP
- 批量生成五张
- 图片删除与版本管理
- Canva
- ComfyUI
- 阶段 7 功能

## 六、验证要求

必须通过：

- 未认证 async check 测试
- 跨用户 async check 测试
- 合法所有者回归测试
- completed/failed 不调用上游测试
- Prisma generate
- 空数据库完整 migration
- lint
- build
- GitHub Actions

不要求再次调用真实图片 API，避免额外费用。

## 七、Git 封存

先提交业务修复：

```text
fix: enforce ownership in async generation checks
```

记录其 SHA 为 Implementation commit。

再提交报告与上下文：

```text
docs: seal stage 6.2 auth and CI fix
```

创建：

```text
stage-6-2-auth-ci-fix
```

不得移动旧标签：

```text
stage-6-image-generation
stage-6-1-hardening
```

## 八、报告

创建：

```text
docs/stages/stage-6-2/STAGE_6_2_REPORT.md
docs/stages/stage-6-2/acceptance-summary.json
```

更新：

```text
PROJECT_CONTEXT.md
```

## 九、最终回复

```text
阶段 6.2 已完成并停止。

仓库：su2517108202-blip/amazon-product-studio
分支：codex/stage-6-2-auth-ci-fix
Implementation commit：<完整 SHA>
最终封存提交：<完整 SHA>
标签：stage-6-2-auth-ci-fix
标签指向：<完整 SHA>
报告：docs/stages/stage-6-2/STAGE_6_2_REPORT.md
GitHub Actions：通过 / 失败
lint：通过 / 失败
build：通过 / 失败
阻塞问题：无 / 一句话
```

完成后停止，不进入阶段 7。
