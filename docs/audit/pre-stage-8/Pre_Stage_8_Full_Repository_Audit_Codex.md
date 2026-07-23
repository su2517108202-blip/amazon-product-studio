# Pre Stage 8 Full Repository Audit Instruction Source

本轮只做阶段 1 至阶段 7.1 的远端封存、真实复现和全仓库审计包。

用户补充基线：

- Branch: `codex/stage-7-1-cn-upload-fix`
- Commit: `1f5a79b2c3e06a0b624de0f61c4b62f8b0320678`
- Tag: `stage-7-1-cn-upload-fix`

审计分支：

- `codex/pre-stage-8-full-audit`

审计标签：

- `pre-stage-8-full-audit`

约束：

- 不修复代码。
- 不移动旧标签。
- 不进入阶段 8。
- 不提交 `.env`、`storage/`、`tmp/`、`node_modules/`、`.next/`、数据库目录、真实密钥、数据库密码、代理凭据、Authorization Header、Cookie、Session Token、图片 Base64、本机绝对敏感路径。

额外重点检查：

1. `saveProjectReference` 使用 `Date.now()` 生成文件名，批量同名文件是否可能碰撞覆盖。
2. 上传验证目前是否只检查 magic bytes，损坏但文件头正确的图片是否会被接受。
3. 并发上传是否可能突破 14 张限制。
4. 并发首次上传是否可能产生多个主参考图。
5. 上传文件扩展名是否应根据检测到的 MIME 统一生成，而不是沿用客户端扩展名。
