# 成章（Chengzhang）

让闪现的想法自然长成文章。

Alpha 是单用户自托管 Web 应用：捕捉碎片 → 组成想法 → 提炼主张 → 组织结构 → 协作草稿 → 导出 Markdown（有本地图片时打成 zip）。

产品与技术方案见 [`docs/`](./docs/)。

## 技术栈

- **TanStack Start** + Vite + **Node.js**（Nitro）
- PostgreSQL + Drizzle ORM
- Better Auth（单用户、服务端会话）
- TanStack Query
- CodeMirror 6 + react-markdown
- Vitest / Playwright
- 生产交付：**Docker Compose**（应用 + Postgres + 图片 volume）

## 本地开发

### 前置

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+（或 Docker Compose 里的 Postgres）

### 安装与数据库

```bash
pnpm install

# 创建数据库（示例）
createdb chengzhang

cp .env.example .env.local
# 编辑 .env.local：DATABASE_URL、BETTER_AUTH_SECRET、AUTH_ALLOWED_EMAIL、AUTH_PASSWORD

# 领域表 migration + Better Auth 表 + 种子用户
pnpm db:generate   # 首次或 schema 变更后
pnpm db:setup
```

### 启动

```bash
pnpm dev
```

打开 <http://localhost:3000>，使用 `.env.local` / seed 中的邮箱密码登录。

`DATABASE_URL` 请带用户名，本机建议：

```bash
DATABASE_URL=postgresql://你的用户@127.0.0.1:5432/chengzhang
```

### 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm dev
pnpm build
pnpm preview
pnpm start          # node .output/server/index.mjs
pnpm db:verify
```

## 自托管（Docker Compose）

应用、PostgreSQL 和上传图片都跑在本机（或一台 VPS）上，不依赖 Cloudflare / Neon。

1. 准备环境变量：

```bash
cp .env.example .env
# 至少改：BETTER_AUTH_SECRET、SESSION_SECRET、AUTH_ALLOWED_EMAIL、AUTH_PASSWORD
# 公网访问时把 APP_ORIGIN / BETTER_AUTH_URL 改成 https://你的域名
```

Compose 会用内部网络连接 Postgres，并覆盖 `DATABASE_URL`。图片存在 volume `media_data`（容器内 `/data/media`）。

2. 构建并启动：

```bash
docker compose up --build -d
```

3. 首次写入登录用户（容器起来之后）：

```bash
docker compose exec app pnpm db:seed
```

4. 打开 `APP_ORIGIN`（默认 <http://localhost:3000>）登录。

健康检查：`GET /api/health`。容器启动时会自动跑 `db:migrate` 和 `auth:migrate`。

备份：Postgres volume + `media_data` 一起拷。逻辑导出仍可用 `pnpm db:export`（需要本机 `pg_dump` 和 `DATABASE_URL`）。

反代 HTTPS 时，让 `APP_ORIGIN` / `BETTER_AUTH_URL` 等于浏览器里的公网地址，并转发 `X-Forwarded-*`，否则 cookie / CSRF 会对不上。

局域网 IP 会变时，不要把会漂的 DHCP 地址写进 `APP_ORIGIN`。在路由器里给机器做 DHCP 预留，或使用稳定主机名（例如 `http://chengzhang.local:3000`）。

更新已部署的实例：

```bash
git pull
docker compose up --build -d
```

也可用 `./scripts/compose-up.sh`。`.env` 不被 git 跟踪，pull 不会覆盖密钥。

## GitHub Actions

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 在 GitHub 托管的 `ubuntu-latest` 上跑 lint、typecheck、test、e2e 和 build。

不要把 **self-hosted runner** 挂到这个公开仓库：fork 出的 PR 可能在你的机器上执行任意 workflow。若要用 Actions 往家里部署，请用 **私有 fork**，只在私有仓注册 runner。

## 主要页面（登录后）

| 路径                       | 用途                                          |
| -------------------------- | --------------------------------------------- |
| `/`                        | 捕捉 / Inbox                                  |
| `/ideas`                   | 想法列表与删除                                |
| `/ideas/$ideaId`           | 想法工作区：素材、AI 主张/分析/追问/结构/初稿 |
| `/drafts/$draftId`         | Markdown 编辑、自动保存、预览、导出           |
| `/settings`                | GPT / Grok / DeepSeek 密钥与模型              |
| `/exports/drafts/$draftId` | 下载 Markdown；有本地图片时为 zip             |
| `/probe/editor`            | 编辑器探针                                    |
| `/probe/ai`                | Mock AI 探针                                  |

### AI 使用

目前只兼容 **GPT、Grok、DeepSeek**。登录后到 `/settings` 选厂商、填 API Key、选一个模型。所有生成都用它。密钥加密存在数据库，不进浏览器。

未配置应用内密钥时仍可回退环境变量（仅 OpenAI）：

```bash
# .env.local / .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_MODEL_PRIMARY=gpt-4o
```

推荐路径：捕捉碎片 → 组成想法（≥2 条）→ **AI 候选主张** → 确认 → 分析/追问 → **AI 结构** → 采用并进草稿 → **AI 初稿** → 接受后编辑导出。

导出：无本地图时下载 `.md`；正文含 `/api/media/…` 时下载 zip，链接改成 `./media/…`，可离线打开。

## 环境变量

见 [`.env.example`](./.env.example)。密钥不得提交到 Git。

## 文档

1. [产品定义](./docs/PRODUCT_SPEC.md)
2. [Alpha 需求](./docs/ALPHA_REQUIREMENTS.md)
3. [Alpha 技术方案](./docs/ALPHA_TECHNICAL_PLAN.md)
4. [设计评审记录](./docs/ALPHA_DESIGN_REVIEW.md)
