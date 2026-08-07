# 成章（Chengzhang）

让闪现的想法自然长成文章。

Alpha 是单用户托管 Web 应用：捕捉碎片 → 组成 Idea → 提炼主张 → 组织结构 → 协作草稿 → 导出 Markdown。

产品与技术方案见 [`docs/`](./docs/)。

## 技术栈（Slice 0）

- TanStack Start + Vite + Nitro（Node 生产产物）
- PostgreSQL + Drizzle ORM
- Better Auth（单用户、服务端会话）
- TanStack Query
- CodeMirror 6 + react-markdown
- Vitest / Playwright（E2E 在后续切片补齐）

## 本地开发

### 前置

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+

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

打开 <http://localhost:3000>，使用 `.env.local` 中的邮箱/密码登录。

### 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start          # 生产：node .output/server/index.mjs（需先 build）
pnpm db:verify
```

## 主要页面（登录后）

| 路径 | 用途 |
| --- | --- |
| `/` | Capture / Inbox（捕捉、筛选、归属 Idea） |
| `/ideas` | Idea 列表与删除 |
| `/ideas/$ideaId` | Idea 工作区：素材、AI 主张/分析/追问/结构/初稿 |
| `/drafts/$draftId` | Markdown 编辑、自动保存、预览、导出 |

### AI 使用

默认 `AI_PROVIDER=mock`（无需密钥，可走完闭环）。

接真实模型：

```bash
# .env.local
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_MODEL_PRIMARY=gpt-4o
```

推荐路径：捕捉碎片 → 组成 Idea（≥2 条）→ **AI 候选主张** → 确认 → 分析/追问 → **AI 结构** → 采用并进草稿 → **AI 初稿** → 接受后编辑导出。
| `/exports/drafts/$draftId` | 下载 UTF-8 Markdown |
| `/probe/editor` | 编辑器探针 |
| `/probe/ai` | Mock AI 探针 |

## 备份

生产环境优先使用托管 PostgreSQL 的自动备份与 PITR。本地可逻辑导出：

```bash
pnpm db:export
# 恢复示例：psql "$DATABASE_URL" < backups/chengzhang-....sql
```

## 环境变量

见 [`.env.example`](./.env.example)。密钥不得提交到 Git。

## 部署（默认 Nitro Node）

```bash
pnpm build
pnpm start
```

产物默认在 `.output/`。部署目标需支持：

- 常驻 Node 进程
- HTTPS 终止（或上游 TLS）
- `DATABASE_URL` 等服务端环境变量
- 出站访问模型供应商（Slice 2+）

具体托管商在首次生产部署后写入本 README。

## 文档

1. [产品定义](./docs/PRODUCT_SPEC.md)
2. [Alpha 需求](./docs/ALPHA_REQUIREMENTS.md)
3. [Alpha 技术方案](./docs/ALPHA_TECHNICAL_PLAN.md)
4. [设计评审记录](./docs/ALPHA_DESIGN_REVIEW.md)
