# 阶段 7.2：阶段 8 前全量修复与回归验收

> 本轮根据 `pre-stage-8-full-audit` 审计结果修复所有阶段 8 前阻塞问题。
> 不进入阶段 8，不自动产生新的收费图片生成调用。

## 一、基线

仓库：`su2517108202-blip/amazon-product-studio`

审计标签：`pre-stage-8-full-audit`

审计提交：`77b476aff85c5bc3971957ba3750f98c4b074431`

从该提交创建：`codex/stage-7-2-pre-stage-8-remediation`

创建前确认工作区干净，不移动任何旧标签。

## 二、项目工作台中文乱码

重点文件：

`src/app/projects/[projectId]/ProjectStudioClient.js`

当前源码存在 `����`、`�ڲ�`、`ͼ1`、`�޷���ȡ��Ŀ` 等乱码。

要求：

1. 所有面向用户的静态文案恢复为正确简体中文。
2. 源码统一保存为 UTF-8。
3. 不允许通过字体、CSS、截图或测试数据掩盖乱码。
4. 不要盲目对整个文件做编码转换，逐项恢复准确含义。
5. 检查 `src/app/`、`src/components/`、`src/lib/` 的用户可见字符串。
6. 增加自动乱码扫描，拒绝 U+FFFD `�` 和已知乱码片段。
7. 增加真实浏览器断言，验证：
   - 正面、背面、侧面、内部、细节、包装、场景、其他
   - 图1 点击首图、图2 核心结构、图3 核心功能、图4 使用场景、图5 细节理由
   - 商品识别、产品身份证、候选图历史、首选图、下载整套首选图
8. 页面中不得出现 `�`。

## 三、剩余英文品牌和本地状态

修改：

- `src/lib/config.js`
- `src/app/page.js`
- `src/components/Navbar.js`

要求：

- `Amazon Product Studio` 改为 `灵图电商工作室`
- 删除或中文化 `Lingtu E-commerce Studio`
- `Local` 改为 `本地模式`
- 面向用户的非技术英文全部清理
- OpenAI、Gemini、DeepSeek、Doubao、API、JSON、ZIP、MIME、HTTP、模型 ID 可保留

本地模式下隐藏不属于当前流程的充值、登录、Stripe、旧发布按钮和旧 SaaS 入口，但不得破坏非本地模式代码。

## 四、上传完整性修复

需要解决：

- `AUD-P2-001` 文件名碰撞
- `AUD-P2-002` 只检查 magic bytes
- `AUD-P2-003` 并发突破 14 张
- `AUD-P2-004` 并发产生多个主参考图
- `AUD-P2-005` 扩展名沿用客户端

### 4.1 唯一存储名

禁止只使用 `Date.now()`。

使用 `crypto.randomUUID()` 或同等强度唯一 ID。

真实存储名必须是：

`UUID + 根据检测 MIME 生成的扩展名`

原始文件名只保存在数据库中用于展示。

### 4.2 扩展名来自真实 MIME

- `image/jpeg` → `.jpg`
- `image/png` → `.png`
- `image/webp` → `.webp`

不能相信客户端扩展名。

增加“有效 PNG 字节但文件名为 .jpg”的测试，最终存储必须为 `.png`。

### 4.3 完整图片解码

Magic bytes 只作为第一层检查。

增加正式解码验证，建议将 `sharp` 作为直接依赖：

1. 实际解码 JPG、PNG、WebP。
2. 损坏但文件头正确的图片必须被拒绝。
3. 设置最大像素限制，防止解压炸弹。
4. 宽高必须大于 0。
5. 解码失败返回 `INVALID_IMAGE_CONTENT`。
6. 不向页面返回底层 decoder 原始错误。
7. 验证后可以继续保存原始有效字节，不强制重新编码。

### 4.4 并发限制与唯一主图

建议在 PostgreSQL 事务中按 `projectId` 使用事务级 advisory lock。

获得锁后重新查询项目归属和图片数量，再执行：

- 14 张限制
- 是否第一张
- 创建图片记录
- 更新封面

增加数据库部分唯一索引：

`UNIQUE(projectId) WHERE isPrimary = true`

migration 创建索引前，安全修复历史重复主图：每个项目保留最早一张，其余设为 false。

不得 reset 用户数据库。

必须新增真实并发测试：

- 两个请求并发上传同名图片，不覆盖。
- 两个首次请求并发上传，最终恰好一个主图。
- 两个请求并发接近 14 张限制，最终不超过 14 张。
- 数据库记录、文件和 storageKey 一致。

## 五、依赖安全

审计结果：4 moderate、9 high、1 critical。

要求：

1. 运行：
   - `npm audit --json`
   - `npm audit --omit=dev --json`
   - `npm outdated`
2. 禁止 `npm audit fix --force`。
3. 对直接依赖做最小兼容升级。
4. 每次升级后运行完整迁移、测试、lint、build。
5. 阶段完成条件：
   - production dependencies critical = 0
   - production dependencies high = 0
6. 无法安全修复的 advisory 必须明确包名、是否生产依赖、利用条件、暂缓原因和补偿措施，不能声称已全部解决。

## 六、旧 MUAPI 路由和日志

重点：

- `src/app/api/upload/route.js`
- `src/lib/config.js`

要求：

1. 删除环境变量名称枚举、API Key 前缀和上游完整错误体日志。
2. 本地模式下旧 `/api/upload` 返回 `410 LEGACY_ROUTE_DISABLED`。
3. 本地模式不得调用固定 MUAPI。
4. 检查旧 `/api/creations`、`/api/download`、Stripe 和 webhook 路由。
5. 本地模式下未使用的旧 SaaS 写接口应禁用或从 UI 不可达。
6. 当前 BYOK 工作流不得依赖 `MU_API_KEY`。
7. 测试日志不包含 `ENV KEYS`、API Key prefix、Authorization 或 Secret。

## 七、Provider 参考图能力

核对：

- `gemini-native-image`
- `openai-image-edit`
- `openai-images`
- `doubao-image`
- `generic-async-image`

规则：

1. 只有真实发送参考图字节或有效图片输入的协议，才能 `supportsReferenceImages = true`。
2. `openai-images` 纯文字生图不得默认标记支持参考图。
3. `generic-async-image` 默认不得用于商品一致性生图，除非有已验证参考图 contract。
4. DeepSeek 不得默认显示图片生成能力，除非具体兼容端点已验证。
5. Doubao 必须通过适配器请求捕获测试证明参考图进入请求；否则标记未验证并阻止默认商品图生成。
6. UI 区分“已验证支持参考图 / 未验证 / 仅文字生图”。
7. 不进行真实收费调用，使用假 Provider 或请求捕获测试。

## 八、候选图分页

API 已返回 `nextCursor`，页面必须增加“加载更多”：

- cursor 追加，不重复、不乱序。
- 切换计划时清空旧 cursor。
- 删除或设首选后刷新当前列表。
- 25 个候选可以全部查看。
- 增加运行时和浏览器测试。

## 九、测试

新增：

- `npm run test:stage-7-2`
- `npm run test:ui-text`

至少覆盖：

### 中文

- 源码无 U+FFFD。
- 项目工作台浏览器无乱码。
- 首页无非技术英文品牌。
- Navbar 本地模式显示“灵图电商工作室”“本地模式”。

### 上传

- 同毫秒同名不碰撞。
- 存储扩展名来自 MIME。
- 损坏合法头图片被拒绝。
- 并发不超过 14 张。
- 并发首次上传只有一个主图。
- 无孤儿文件或记录。
- 跨用户继续拒绝。

### Legacy

- 本地 `/api/upload` 返回 410。
- 不读取或输出 MUAPI Key。
- 不输出环境变量名称和密钥前缀。

### Provider

- 能力声明与真实请求序列化一致。
- 纯文字协议被阻止用于默认商品一致性流程。

### 分页

- 25 个候选全部可加载。
- 无重复、无跳项。

## 十、真实 UI 验收

启动本地应用并真实操作：

- `/`
- `/settings/providers`
- `/projects/<新建中文测试项目>`

视口：

- 桌面 `1440x900`
- 移动 `390x844`

完成：

1. 新建中文项目。
2. 同名 JPG/PNG/WebP 上传。
3. 中文文件名上传。
4. 刷新和服务重启恢复。
5. 工作台主要标签正确中文。
6. 页面中搜索不到 `�`。
7. ProductIdentity 和五图策划读取正常。
8. 本地测试候选超过 12 条并加载全部。
9. 首选、下载和 ZIP 回归正常。
10. 不触发新的收费图片生成。

截图目录：

`docs/stages/stage-7-2/ui-acceptance/`

至少：

- `01-home-cn.png`
- `02-navbar-cn.png`
- `03-provider-cn.png`
- `04-upload-cn.png`
- `05-project-studio-cn.png`
- `06-five-plans-cn.png`
- `07-candidate-pagination.png`
- `08-mobile-cn.png`

## 十一、质量与迁移

运行：

- `npm ci`
- `npx prisma format --config prisma.config.ts`
- `npx prisma generate --config prisma.config.ts`
- `npx prisma migrate dev --config prisma.config.ts`
- `npm run test:stage-6-1`
- `npm run test:stage-6-2`
- `npm run test:stage-7`
- `npm run test:stage-7-1`
- `npm run test:stage-7-2`
- `npm run test:ui-text`
- `npm run lint`
- `npm run build`
- `npm audit --omit=dev --json`

在临时空 PostgreSQL 数据库运行完整 `prisma migrate deploy`。

不得 reset 用户主数据库。

## 十二、范围限制

不要开发阶段 8 新功能、自动连续收费生成五张、Canva、ComfyUI、视频、AI 模特、多用户 SaaS、Stripe、积分或新外部编辑器。

## 十三、封存

Implementation commit：

`fix: remediate pre-stage-8 audit findings`

报告提交：

`docs: seal stage 7.2 pre-stage-8 remediation`

标签：

`stage-7-2-pre-stage-8-remediation`

不得移动旧标签。

创建：

- `docs/stages/stage-7-2/STAGE_7_2_REPORT.md`
- `docs/stages/stage-7-2/UI_ACCEPTANCE.md`
- `docs/stages/stage-7-2/acceptance-summary.json`

更新：

- `PROJECT_CONTEXT.md`
- `docs/audit/pre-stage-8/KNOWN_FAILURES.md`

旧问题保留历史记录并标记 `resolved / remaining / accepted`。

## 十四、最终回复

```text
阶段 7.2 已完成并停止。

仓库：su2517108202-blip/amazon-product-studio
分支：codex/stage-7-2-pre-stage-8-remediation
Implementation commit：<完整 SHA>
最终封存提交：<完整 SHA>
标签：stage-7-2-pre-stage-8-remediation
标签指向：<完整 SHA>
乱码修复：通过 / 失败
并发上传：通过 / 失败
完整图片解码：通过 / 失败
Provider 参考图能力：通过 / 失败
候选分页：通过 / 失败
production npm audit critical：
production npm audit high：
GitHub Actions：通过 / 失败
lint：通过 / 失败
build：通过 / 失败
阻塞问题：无 / 一句话
```

完成后停止，不进入阶段 8。
