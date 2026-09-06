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

## GitHub Actions：检查 vs 家里部署

| Workflow                                                                       | Runner                         | 做什么                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml)                         | GitHub 托管（`ubuntu-latest`） | PR / `main` 上 lint、typecheck、test、e2e、build                                                   |
| [`.github/workflows/deploy-homelab.yml`](.github/workflows/deploy-homelab.yml) | **Self-hosted**（你家的机器）  | 手动 `workflow_dispatch` 后，在部署目录上 `docker compose up`（runner 就绪后可再打开 push `main`） |

检查不必搬到家里：GitHub 的 VM 有现成 Postgres，homelab 关机也不会挡住 PR。部署必须在能跑 Docker 的那台机器上，所以才用 self-hosted runner。

Runner **只出站连 GitHub**，不用做端口转发。

### 1. 机器上准备目录和 `.env`

```bash
sudo mkdir -p /opt/chengzhang
sudo chown "$USER:$USER" /opt/chengzhang
git clone git@github.com:你的用户/chengzhang.git /opt/chengzhang
cp /opt/chengzhang/.env.example /opt/chengzhang/.env
# 编辑 /opt/chengzhang/.env（密钥、APP_ORIGIN）
```

装 Docker（Mac Mini 用 Docker Desktop 或 OrbStack）以及 Compose。目录可用仓库变量 `CHENGZHANG_DEPLOY_DIR` 改掉；Linux 默认 `/opt/chengzhang`，Mac 可用 `/Users/你的用户名/chengzhang`。

### 2. 注册 self-hosted runner

仓库 → **Settings → Actions → Runners → New self-hosted runner**。Linux 选 Linux；**Mac Mini（Apple Silicon）选 macOS + ARM64**。**按页面上的命令**下载、配置（token 每次不同，不要抄别人的）：

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# 页面上的 curl / tar 命令
./config.sh --url https://github.com/你的用户/chengzhang --token 页面上的TOKEN --name homelab
./svc.sh install
./svc.sh start
```

Linux 上 `svc.sh` 可能需要 `sudo`。

同一用户要既能跑 runner，又能操作 `/opt/chengzhang` 和 `docker`。

仓库保持 **Private**。不要把 self-hosted runner 接到会跑 fork PR 的公开仓库：别人的 workflow 会在你家里执行。

### 3. 第一次部署

```bash
cd /opt/chengzhang
docker compose up --build -d
docker compose exec app pnpm db:seed
```

之后在 Actions 里手动跑 **Deploy homelab** 即可更新。`.env` 在 gitignore 里，`git checkout` 不会覆盖它。Runner 就绪后，可在 `deploy-homelab.yml` 里恢复 `push: branches: [main]`。

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
