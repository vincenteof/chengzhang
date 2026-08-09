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
2. **在本机**对生产库执行（Worker 内不跑 migration）：

```bash
DATABASE_URL='postgresql://…' pnpm db:setup
```

3. （推荐）在 Cloudflare Dashboard 创建 **Hyperdrive**，指向该库；把 id 填进 `wrangler.jsonc` 的 `hyperdrive` 段并取消注释。

### 2. 登录与密钥

```bash
pnpm exec wrangler login

pnpm exec wrangler secret put DATABASE_URL          # 若未用 Hyperdrive，必填
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put SESSION_SECRET       # 可与上相同策略的长随机串
pnpm exec wrangler secret put BETTER_AUTH_URL      # 例如 https://chengzhang.<subdomain>.workers.dev
pnpm exec wrangler secret put APP_ORIGIN           # 与 BETTER_AUTH_URL 一致
# 可选真 AI：
# pnpm exec wrangler secret put OPENAI_API_KEY
```

将 `wrangler.jsonc` 里 `vars.AI_PROVIDER` 保持 `mock`，或在 Dashboard 改为 `openai`。

### 3. 部署

```bash
pnpm deploy
```

自定义域名：Workers → 该 Worker → Custom Domains，并同步更新 `APP_ORIGIN` / `BETTER_AUTH_URL` secrets。

### 4. 注意

| 项 | 说明 |
| --- | --- |
| **Workers Free** | 单请求 CPU 约 10ms，SSR+DB 可能偏紧；真 AI 建议 **Workers Paid** |
| **Pool** | 生产 `DB_POOL_MAX=1`（已在 wrangler vars） |
| **Migration / seed** | 始终在 CI 或本机对库执行，不要放进 Worker |
| **Cookie** | 生产 URL 必须与 `BETTER_AUTH_URL` 一致 |

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
