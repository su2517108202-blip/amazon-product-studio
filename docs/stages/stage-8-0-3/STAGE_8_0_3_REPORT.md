# Stage 8.0.3 本地体验热修复报告

## 范围

- 基于 `stage-8.0.2-local-usability-fix` 创建 `codex/stage-8-0-3-auto-match-drag-drop`。
- 保存设计方案原文到 `docs/design/灵图电商工作室_V2_体验重构方案_Stage8.0.3.md`。
- 首页和项目工作台支持点击、拖拽、Ctrl+V 上传参考图。
- 模型选择后自动识别能力与协议，协议和能力移入高级设置。
- 三角色支持一键推荐，并保留用户锁定的角色绑定。
- 项目工作台重排为左侧商品与参考图、中间五图流程、右侧候选图。

## 保留项

- 保留本地免登录模式。
- 保留项目、素材库、结果管理和首选图规则。
- 未恢复 MuAPI、登录、积分、Stripe。
- 新增收费调用：0。

## 验收

- 新增 `npm run test:stage-8-0-3`。
- CI 中新增 `Stage 8.0.3 auto match drag drop checks`。
- 失败时上传 `tmp/stage8-0-3-auto-match/diagnostics/**` 和 `docs/stages/stage-8-0-3/ui-acceptance/*.png`。
