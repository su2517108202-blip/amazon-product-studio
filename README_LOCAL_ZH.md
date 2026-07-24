# 灵图电商工作室本地版说明

灵图电商工作室是本地运行的电商商品图工作台。阶段 8 版本支持创建项目、上传商品参考图、商品识别、五张主图策划、逐张生成候选图、设置五张首选图，并下载单图或整套 ZIP。

## 安装

1. 安装 Node.js 20 或更高版本。
2. 安装并启动 PostgreSQL。
3. 在项目根目录执行 `npm ci`。
4. 复制 `.env.example` 为 `.env`，按本机环境修改数据库连接。

## 环境配置

必须配置：

- `APP_MODE=local`
- `NEXT_PUBLIC_APP_MODE=local`
- `DATABASE_URL`
- `DIRECT_URL`
- `DEFAULT_LOCAL_USER_ID`
- `CREDENTIAL_ENCRYPTION_KEY`
- `NEXTAUTH_URL=http://localhost:3000`
- `NEXTAUTH_SECRET`

生成加密密钥：

```text
npm run generate:credential-key
```

把输出写入 `.env` 的 `CREDENTIAL_ENCRYPTION_KEY`。不要把 `.env`、数据库连接串或 API Key 提交到仓库。

## 启动

双击 `start-lingtu.bat`，或在 PowerShell 中执行：

```text
scripts/start-local.ps1
```

启动脚本会检查 Node.js、npm、PostgreSQL、必要环境变量、加密密钥、storage 可写性和端口 3000，然后执行 Prisma generate 与 migrate deploy。脚本不会执行 reset，也不会修改或删除用户数据。启动成功后会打开 `http://localhost:3000`。

单独检查环境：

```text
node scripts/doctor-local.mjs
```

## Provider 三角色配置

进入“API 设置”，分别绑定三个角色：

- 商品识图：需要 vision 能力。
- 策划与提示词：需要 text 能力。
- 图片生成：需要 image 能力，并且协议必须真实支持参考图。

API Key 只会以掩码显示。Provider 技术品牌、Model ID、Protocol 和 fingerprint 会放在高级信息中，普通工作流不需要理解这些字段。

## 使用流程

1. 在首页创建中文项目。
2. 打开项目，上传 JPG、PNG 或 WebP 商品参考图。
3. 设置主参考图，并勾选哪些图片参与识别、哪些图片参与生成。
4. 点击“识别商品”，确认产品身份证。
5. 点击“生成 5 张主图策划”。
6. 在图 1 至图 5 之间切换，必要时编辑并保存策划。
7. 对当前策划逐张生成候选图。强制重新生成会保留旧候选。
8. 在候选历史中选择首选图。
9. 五张策划都选定首选后，下载整套 ZIP。
10. 可以下载单图，也可以删除非首选候选图。

## 数据备份

备份 PostgreSQL 数据库，并备份项目根目录下的 `storage` 目录。恢复时先恢复数据库，再恢复同一份 `storage` 目录。

## 升级

升级代码后执行：

```text
npm ci
npx prisma generate
npx prisma migrate deploy
```

不要使用 reset 命令升级本地数据。

## 常见错误

- 端口 3000 被占用：关闭占用程序后重新运行启动脚本。
- PostgreSQL 连接失败：确认数据库服务已启动，`.env` 中数据库地址正确。
- 无法保存 API Key：确认 `CREDENTIAL_ENCRYPTION_KEY` 是 32 字节密钥或 32 字节 base64。
- 图片上传失败：仅支持 JPG、PNG、WebP，单张参考图不超过 12MB。
- 图片生成按钮不可用：确认图片生成角色已绑定，并且协议真实支持参考图。
- ZIP 无法下载：五张策划都必须设置首选图。
