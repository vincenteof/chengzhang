# 成章（Chengzhang）

让闪现的想法自然长成文章。

Alpha 是单用户托管 Web 应用：捕捉碎片 → 组成想法 → 提炼主张 → 组织结构 → 协作草稿 → 导出 Markdown。

产品与技术方案见 [`docs/`](./docs/)。

## 技术栈

- **TanStack Start** + Vite + **Cloudflare Workers**（官方推荐托管）
- PostgreSQL + Drizzle ORM（生产建议经 **Hyperdrive** 访问）
- Better Auth（单用户、服务端会话）
- TanStack Query
- CodeMirror 6 + react-markdown
- Vitest / Playwright（E2E 在后续切片补齐）

## 本地开发

### 前置

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+（或 Neon 等托管库）
- 可选：Cloudflare 账号（部署时）

### 安装与数据库

```bash
pnpm install

# 创建数据库（示例）
createdb chengzhang

cp .env.example .env.local
# 编辑 .env.local：DATABASE_URL、BETTER_AUTH_SECRET、AUTH_ALLOWED_EMAIL、AUTH_PASSWORD

# Cloudflare 本地运行时密钥（与 wrangler 一致）
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 中的 DATABASE_URL / BETTER_AUTH_* 等

# 领域表 migration + Better Auth 表 + 种子用户
pnpm db:generate   # 首次或 schema 变更后
pnpm db:setup
```

### 启动

```bash
pnpm dev
```

打开 <http://localhost:3000>，使用 `.env.local` / seed 中的邮箱密码登录。

> **本地默认用 Node（Nitro）**，这样 `pg` 能稳定连本机 Postgres。  
> 生产部署仍是 **Cloudflare Workers**（`pnpm build` / `pnpm deploy`）。  
> 若要在本地模拟 workerd：`pnpm dev:cf`（连库更容易超时，日常开发请用 `pnpm dev`）。

`DATABASE_URL` 请带用户名，本机建议：

```bash
DATABASE_URL=postgresql://你的用户@127.0.0.1:5432/chengzhang
```

（不要用不带用户的 `postgresql://localhost/...`，在 Workers 下会挂死/报错。）

### 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm dev           # 本地 Node，推荐
pnpm dev:cf        # 本地 Cloudflare workerd（可选）
pnpm build         # Cloudflare Workers 产物
pnpm preview       # 预览 Workers 构建
pnpm deploy        # build + wrangler deploy
pnpm db:verify
```

## 部署到 Cloudflare Workers

官方路径：TanStack Start + [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) + Wrangler。

### 1. 准备数据库

1. 使用托管 Postgres（如 Neon）。
2. **在本机**对生产库执行（Worker 内不跑 migration）。

便捷脚本（推荐）：

```bash
# 首次：已可编辑 scripts/neon-cloudflare.env（gitignore，勿提交）
# 或从模板复制：
#   cp scripts/neon-cloudflare.env.example scripts/neon-cloudflare.env

# 编辑 neon-cloudflare.env：
#   DATABASE_URL = Neon Direct（不要 -pooler）+ sslmode=require
#   AUTH_*、BETTER_AUTH_SECRET

pnpm db:setup:neon          # 测连通 + db:setup
pnpm exec wrangler login
pnpm cf:secrets             # 推 secret
pnpm deploy                 # 或 pnpm cf:deploy（secrets + deploy）
# 把 env 里 APP_ORIGIN / BETTER_AUTH_URL 改成 https://….workers.dev 后再 pnpm cf:secrets
```

手动一次性：

```bash
DATABASE_URL='postgresql://…' pnpm db:setup
```

3. （推荐）在 Cloudflare Dashboard 创建 **Hyperdrive**，指向该库；把 id 填进 `wrangler.jsonc` 的 `hyperdrive` 段并取消注释。

### 2. 登录与密钥（一次性，存在 Cloudflare 侧）

```bash
pnpm exec wrangler login
# 或编辑 scripts/neon-cloudflare.env 后：
pnpm cf:secrets
```

需要的 secrets（Dashboard → Workers → chengzhang → Settings → Variables 亦可）：

- `DATABASE_URL`（Neon；未用 Hyperdrive 时必填）
- `BETTER_AUTH_SECRET` / `SESSION_SECRET`
- `BETTER_AUTH_URL` / `APP_ORIGIN`（部署后的 `https://….workers.dev`，两者一致）
- 可选：`OPENAI_API_KEY`；`AI_PROVIDER` 默认在 `wrangler.jsonc` vars 为 `mock`

### 3. 部署方式

#### A. GitHub Actions（推荐）

推送到 **`main`** 或在 Actions 里手动 **Run workflow** →  
[`.github/workflows/deploy-cloudflare.yml`](./.github/workflows/deploy-cloudflare.yml) 会 `pnpm build` + `wrangler deploy`。

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 配置：

| Secret | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（权限见下） |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID（Workers 概览页右侧 / `wrangler whoami`） |

Token 建议权限（最小可用）：

- Account → **Cloudflare Workers Scripts** → Edit  
- Account → **Account Settings** → Read（部分账号需要）

业务密钥（库、登录）**不要**放进 GitHub；继续只放在 Cloudflare Secrets。

#### B. 本机命令行

```bash
pnpm deploy
```

自定义域名：Workers → 该 Worker → Custom Domains，并同步更新 `APP_ORIGIN` / `BETTER_AUTH_URL` secrets。

### 4. 注意

| 项 | 说明 |
| --- | --- |
| **Workers Free** | 单请求 CPU 约 10ms，SSR+DB 可能偏紧；真 AI 建议 **Workers Paid** |
| **Pool** | 生产 `DB_POOL_MAX=1`（已在 wrangler vars） |
| **Neon on Workers** | 运行时使用 `@neondatabase/serverless`（勿在 Worker 上对 Neon 走 node-pg TCP，会 connect timeout） |
| **Migration / seed** | 始终在本机对 Neon 执行（`pnpm db:setup:neon`），不要放进 Worker 启动 |
| **Cookie** | 生产 URL 必须与 `BETTER_AUTH_URL` 一致 |
| **分支** | 自动部署只监听 `main`；先把 `alpha` 合并/推到 `main` |

## 主要页面（登录后）

| 路径 | 用途 |
| --- | --- |
| `/` | 捕捉 / Inbox |
| `/ideas` | 想法列表与删除 |
| `/ideas/$ideaId` | 想法工作区：素材、AI 主张/分析/追问/结构/初稿 |
| `/drafts/$draftId` | Markdown 编辑、自动保存、预览、导出 |
| `/exports/drafts/$draftId` | 下载 UTF-8 Markdown |
| `/probe/editor` | 编辑器探针 |
| `/probe/ai` | Mock AI 探针 |

### AI 使用

默认 `AI_PROVIDER=mock`。接真实模型：

```bash
# .env.local / .dev.vars / wrangler secret + vars
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_MODEL_PRIMARY=gpt-4o
```

推荐路径：捕捉碎片 → 组成想法（≥2 条）→ **AI 候选主张** → 确认 → 分析/追问 → **AI 结构** → 采用并进草稿 → **AI 初稿** → 接受后编辑导出。

## 备份

生产环境优先使用托管 PostgreSQL 的自动备份与 PITR。本地可逻辑导出：

```bash
pnpm db:export
# 恢复示例：psql "$DATABASE_URL" < backups/chengzhang-....sql
```

## 环境变量

见 [`.env.example`](./.env.example) 与 [`.dev.vars.example`](./.dev.vars.example)。密钥不得提交到 Git。

## 文档

1. [产品定义](./docs/PRODUCT_SPEC.md)
2. [Alpha 需求](./docs/ALPHA_REQUIREMENTS.md)
3. [Alpha 技术方案](./docs/ALPHA_TECHNICAL_PLAN.md)
4. [设计评审记录](./docs/ALPHA_DESIGN_REVIEW.md)
