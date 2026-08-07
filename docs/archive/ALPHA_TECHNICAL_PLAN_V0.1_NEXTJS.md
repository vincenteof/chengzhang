# 成章 Alpha：技术方案与实施计划（v0.1 / Next.js 历史快照）

> 文档状态：已被 v0.2 取代，仅供技术路线对照
> 版本：0.1
> 原更新日期：2026-08-06
> 当前方案：[ALPHA_TECHNICAL_PLAN.md](../ALPHA_TECHNICAL_PLAN.md)
> 对应需求：[ALPHA_REQUIREMENTS.md](../ALPHA_REQUIREMENTS.md)

## 0. 与当前 v0.2 的主要区别

| 关注点 | v0.1 | v0.2 当前方案 |
| --- | --- | --- |
| 全栈框架 | Next.js App Router | TanStack Start |
| 构建 | Next.js build | Vite + Nitro Node |
| 路由 | App Router | TanStack Router 文件路由 |
| 首屏读取 | Server Component 直接调用 service | Router loader 调用 Server Function |
| 内部 mutation | Route Handler + JSON API | 类型安全 Server Function |
| 服务端状态 | 自有 fetch/cache 或轻量 client | TanStack Query |
| 文件下载 | Route Handler | Server Route |
| AI streaming | Route Handler Web Stream | 优先 typed Server Function stream，必要时 Server Route |
| 网络契约 | 显式 REST 风格 endpoint | 应用内 RPC 为主，原始 HTTP 为辅 |
| 框架风险 | Next.js 运行形态与 SQLite/Serverless 边界 | TanStack Start RC、Nitro 与原生 SQLite 模块兼容性 |

数据模型、AI Provider Adapter、Prompt 版本、自动保存、revision、Markdown 导出和纵向 Slice 基本保持一致。

## 1. 方案摘要

v0.1 采用一个本地运行的 TypeScript Web 单体：

- **应用框架**：Next.js App Router；
- **运行时**：Node.js LTS；
- **数据存储**：本地 SQLite 文件；
- **数据库访问**：Drizzle ORM 与版本化 SQL migration；
- **Markdown 编辑**：CodeMirror 6；
- **Markdown 预览**：`react-markdown`、GFM 插件与 HTML sanitize；
- **输入校验与 AI Schema**：Zod；
- **AI 接入**：服务端 Provider Adapter，默认实现 OpenAI Responses API；
- **测试**：Vitest、React Testing Library、Playwright；
- **部署形态**：单用户、本机进程，默认只监听 loopback 地址。

架构目标是完成：

```text
Fragment -> Idea -> Claim -> Outline -> Draft -> Markdown export
```

三个底线：

1. 原始 Fragment 不会被 AI 修改；
2. AI 失败不会导致用户输入或正文丢失；
3. 模型供应商、提示词和 UI 不直接耦合领域数据层。

## 2. 技术决策与理由

### 2.1 使用 Next.js 单体

选择 Next.js App Router，在同一项目中承载页面、服务端渲染、Route Handler 和本地数据库访问。

理由：

- Alpha 没有独立公共 API、移动客户端或多服务需求；
- 单体减少跨仓库、CORS、部署和共享类型复杂度；
- Server Component 适合首屏数据读取；
- Route Handler 适合客户端保存、导出与 AI 流式请求；
- 领域 service 与 API contract 后续仍可外移。

约束：

- Server Component 读取直接调用 service，不绕行本应用 HTTP API；
- 客户端 mutation、自动保存、AI 请求和下载使用 Route Handler；
- 不使用静态导出，因为需要 Node 运行时与 SQLite 写入；
- 数据库查询不能写在 React 组件内；
- AI SDK 和密钥只能存在于服务端模块。

### 2.2 使用 SQLite

Alpha 是单用户本地应用，SQLite 与实际并发和部署需求匹配。

- 无需额外数据库服务；
- 数据是易备份的本地文件；
- 支持事务、外键、索引和 migration；
- 足够承载 Fragment、Idea、Draft 与 AI generation；
- 未来可在 repository 层迁移到 PostgreSQL。

配置：

- `PRAGMA foreign_keys = ON`；
- WAL journal mode；
- busy timeout；
- 数据文件 `data/chengzhang.db`；
- `data/` 加入 `.gitignore`；
- migration 提交 Git；
- 测试使用临时数据库。

### 2.3 使用 Drizzle

- `src/server/db/schema.ts` 为代码侧 schema 入口；
- `drizzle/` 保存生成并审查后的 migration；
- 不把 `push` 作为正式升级流程；
- 所有跨表写入使用 transaction；
- 首选 `better-sqlite3`，如果 Node LTS 原生模块不稳定则切换 `node:sqlite`。

### 2.4 Markdown 使用源码编辑

- CodeMirror 6 负责 Markdown 源码；
- `react-markdown` 负责预览；
- `remark-gfm` 支持表格、删除线和任务列表；
- `rehype-sanitize` 阻止危险 HTML；
- Alpha 不执行原始 HTML；
- 编辑器通过薄适配层隔离 CodeMirror 类型。

### 2.5 AI 使用 Provider Adapter

```ts
interface AiProvider {
  generateObject<T>(request: StructuredRequest<T>): Promise<AiResult<T>>;
  generateText(request: TextRequest): Promise<AiResult<string>>;
  streamText(request: TextRequest): AsyncIterable<AiTextEvent>;
}
```

默认 Provider 为 OpenAI Responses API。

首个模型策略：

- 默认基线：`gpt-5.6-terra`；
- `claim`、`analysis`、`outline`、`draft` 从 medium reasoning 开始；
- `organize`、`polish`、`feedback` 从 low reasoning 开始；
- model 和 reasoning 由服务端配置映射；
- 对真实样例比较 Terra 与 Sol，再决定质量优先步骤是否升级。

结构化任务使用 JSON Schema：

- 候选主张；
- 素材分析；
- 追问；
- 结构方案；
- 反馈；
- 组织、补写和润色建议。

正文生成可以流式返回，但只进入 suggestion buffer；用户确认后才写入 Draft。

## 3. 系统结构

```text
Browser
  |
  | page navigation / JSON / text stream / file download
  v
Next.js application
  +-- UI and route composition
  +-- Route Handlers
  +-- Application Services
  +-- AI Orchestrator ----> AiProvider ----> OpenAI API
  +-- Repositories
  +-- Export Service
  |
  v
SQLite file
```

### 3.1 UI 层

- 页面和交互；
- 客户端即时校验；
- optimistic UI；
- 未提交输入本地恢复；
- suggestion 展示、接受与拒绝；
- 不直接访问数据库或模型 SDK。

### 3.2 Route Handler 层

- HTTP contract；
- 请求解析与 Zod 校验；
- AbortSignal 和流式响应；
- 调用 application service；
- 将领域错误映射为稳定错误码；
- 不承载 Prompt 拼接和复杂业务判断。

### 3.3 Application Service 层

- 业务规则和 transaction；
- Fragment 与 Idea 关联规则；
- revision 冲突；
- generation 生命周期；
- 接受建议后的领域写入；
- 脱离 HTTP 单元测试。

### 3.4 Repository 层

- Drizzle 查询；
- 数据持久化；
- 不暴露 query builder；
- 不包含 UI 文案或 Prompt。

### 3.5 AI Orchestrator

- 装配最小上下文；
- 调用版本化 Prompt；
- 选择模型和 schema；
- 记录 generation、耗时和 token；
- 处理 refusal、超时、取消和解析失败；
- 不直接修改正文。

### 3.6 Export Service

- 校验元数据；
- 安全生成 YAML front matter；
- 生成 UTF-8 Markdown 与安全文件名；
- 不改变 Draft 状态。

## 4. v0.1 目录结构

```text
.
├── docs/
├── drizzle/
├── data/                         # gitignored
├── public/
├── scripts/
│   ├── backup-db.ts
│   └── run-prompt-evals.ts
├── src/
│   ├── app/
│   │   ├── (workspace)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Capture / Inbox
│   │   │   ├── ideas/page.tsx
│   │   │   ├── ideas/[ideaId]/page.tsx
│   │   │   └── drafts/[draftId]/page.tsx
│   │   └── api/
│   │       ├── fragments/
│   │       ├── ideas/
│   │       ├── drafts/
│   │       ├── generations/
│   │       └── exports/
│   ├── components/
│   │   ├── capture/
│   │   ├── ideas/
│   │   ├── editor/
│   │   ├── ai-suggestions/
│   │   └── ui/
│   ├── modules/
│   │   ├── fragments/
│   │   ├── ideas/
│   │   ├── drafts/
│   │   ├── generations/
│   │   └── export/
│   ├── server/
│   │   ├── ai/
│   │   │   ├── provider.ts
│   │   │   ├── openai-provider.ts
│   │   │   ├── orchestrator.ts
│   │   │   ├── model-policy.ts
│   │   │   ├── prompts/
│   │   │   └── schemas/
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   ├── schema.ts
│   │   │   └── migrate.ts
│   │   └── observability/
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── errors.ts
│   │   └── ids.ts
│   └── test/
├── e2e/
├── .env.example
├── drizzle.config.ts
└── package.json
```

## 5. 数据模型

### 5.1 通用约定

- UUID v7 或有序字符串 ID；
- 时间统一保存并通过 API 输出 ISO 8601；
- 用户可编辑实体包含整数 `revision`；
- 客户端保存提交 `baseRevision`；
- revision 不一致返回 `409 REVISION_CONFLICT`；
- Alpha 硬删除，删除前返回影响范围；
- API key 不进入数据库。

### 5.2 `fragments`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| content | text | not null，trim 后非空 |
| revision | integer | not null，default 1 |
| created_at | integer | not null |
| updated_at | integer | not null |

### 5.3 `ideas`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| name | text | not null |
| description | text | nullable |
| confirmed_claim | text | nullable |
| claim_source_generation_id | text | nullable |
| revision | integer | not null，default 1 |
| created_at | integer | not null |
| updated_at | integer | not null |

Idea 阶段由数据推导，不增加用户手动维护的状态。

### 5.4 `idea_fragments`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| idea_id | text | FK -> ideas，cascade delete |
| fragment_id | text | FK -> fragments，cascade delete |
| position | integer | nullable |
| created_at | integer | not null |

主键为 `(idea_id, fragment_id)`。

### 5.5 `idea_questions`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| idea_id | text | FK -> ideas，cascade delete |
| generation_id | text | FK -> ai_generations |
| question | text | not null |
| target_gap | text | nullable |
| why_it_matters | text | nullable |
| answered_fragment_id | text | nullable，FK -> fragments，set null |
| dismissed_at | integer | nullable |
| created_at | integer | not null |

回答追问时，transaction 内创建 Fragment、建立 IdeaFragment、回填答案并更新 Idea revision。

### 5.6 `drafts`

v0.1 决策：一个 Idea 最多一个 Draft。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| idea_id | text | FK -> ideas，unique，restrict delete |
| title | text | not null |
| description | text | nullable |
| slug | text | nullable |
| tags_json | text | not null，default `[]` |
| outline_json | text | not null，带 schemaVersion |
| content | text | not null |
| status | text | drafting/completed |
| revision | integer | not null，default 1 |
| created_at | integer | not null |
| updated_at | integer | not null |

### 5.7 `ai_generations`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| operation | text | 受控 enum |
| idea_id | text | nullable FK |
| draft_id | text | nullable FK |
| provider | text | not null |
| model | text | not null |
| reasoning | text | nullable |
| prompt_version | text | not null |
| input_snapshot_json | text | not null |
| fragment_ids_json | text | not null |
| output_json | text | nullable |
| output_text | text | nullable |
| execution_status | text | pending/succeeded/failed/cancelled |
| resolution | text | pending/accepted/rejected/superseded |
| error_code | text | nullable |
| error_message | text | nullable，脱敏 |
| input_tokens | integer | nullable |
| output_tokens | integer | nullable |
| started_at | integer | not null |
| completed_at | integer | nullable |
| resolved_at | integer | nullable |

Generation append-only；接受建议时目标实体与 resolution 在同一 transaction 更新。

## 6. HTTP API 与错误协议

标准错误：

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "草稿已在其他位置更新",
    "retryable": false,
    "requestId": "req_...",
    "details": {}
  }
}
```

### 6.1 Fragment API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/fragments` | cursor 列表与 unassigned 筛选 |
| POST | `/api/fragments` | 创建 |
| PATCH | `/api/fragments/:id` | revision 编辑 |
| DELETE | `/api/fragments/:id` | 确认影响后删除 |

### 6.2 Idea API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/ideas` | 列表 |
| POST | `/api/ideas` | 创建，可带 fragmentIds |
| GET | `/api/ideas/:id` | Workspace 数据 |
| PATCH | `/api/ideas/:id` | 名称、说明或 Claim |
| DELETE | `/api/ideas/:id` | 删除 |
| POST | `/api/ideas/:id/fragments` | 批量加入 |
| DELETE | `/api/ideas/:id/fragments/:fragmentId` | 移出 |
| POST | `/api/ideas/:id/questions/:questionId/answer` | 回答回流 |

### 6.3 Draft API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/ideas/:id/draft` | 创建 Draft |
| GET | `/api/drafts/:id` | 获取 |
| PATCH | `/api/drafts/:id` | 自动保存 |
| POST | `/api/drafts/:id/complete` | 完成 |
| POST | `/api/drafts/:id/reopen` | 重开 |
| GET | `/api/drafts/:id/export.md` | Markdown 下载 |

### 6.4 AI API

| 方法 | 路径 | 输出 |
| --- | --- | --- |
| POST | `/api/ideas/:id/ai/claims` | 候选主张 |
| POST | `/api/ideas/:id/ai/analysis` | 素材分析 |
| POST | `/api/ideas/:id/ai/questions` | 追问 |
| POST | `/api/ideas/:id/ai/outlines` | 结构方案 |
| POST | `/api/ideas/:id/ai/draft` | 初稿 stream |
| POST | `/api/drafts/:id/ai/organize` | 修改建议 |
| POST | `/api/drafts/:id/ai/expand` | 补写建议 |
| POST | `/api/drafts/:id/ai/polish` | 润色建议 |
| POST | `/api/drafts/:id/ai/feedback` | 反馈 |
| POST | `/api/generations/:id/accept` | 接受 |
| POST | `/api/generations/:id/reject` | 拒绝 |
| POST | `/api/generations/:id/cancel` | 取消 |

结构化请求返回 JSON；长文本使用 Web Streams 或 `text/event-stream`。不引入 WebSocket。

## 7. AI Orchestrator 设计

### 7.1 具名 operation

```ts
type AiOperation =
  | "claim"
  | "analysis"
  | "questions"
  | "outline"
  | "draft"
  | "organize"
  | "expand"
  | "polish"
  | "feedback";
```

不维护通用聊天历史；每次从数据库最新状态重建最小上下文。

### 7.2 Prompt 组成与版本

```text
Base authorship policy
  + operation instruction
  + output contract
  + Idea and confirmed Claim
  + Fragment blocks with stable IDs
  + relevant Outline or Draft range
  + explicit user instruction
```

Prompt 按 `base-authorship.v1.ts`、`claim.v1.ts` 等文件版本化。每次 generation 保存版本号。

### 7.3 Candidate Claim Schema

```ts
const candidateClaimsSchema = z.object({
  canFormClaim: z.boolean(),
  insufficiencyReason: z.string().nullable(),
  candidates: z.array(z.object({
    id: z.string(),
    claim: z.string(),
    rationale: z.string(),
    evidence: z.array(z.object({
      fragmentId: z.string(),
      reason: z.string(),
    })),
    tensions: z.array(z.string()),
    uncertainties: z.array(z.string()),
  })).max(3),
});
```

应用层继续检查引用 ID、候选数量和当前 Idea revision。

### 7.4 上下文预算

- 10 至 30 条时发送当前 Idea 全部 Fragment；
- 超阈值时让用户选择；
- 不在 Alpha 引入向量检索；
- 不用 AI 摘要替代原文；
- 选区操作只发送必要上下文；
- 记录 token 后再优化。

### 7.5 生命周期

```text
validate
  -> load entity + revision
  -> build snapshot
  -> generation(pending)
  -> provider(timeout + AbortSignal)
  -> validate
  -> generation(succeeded | failed | cancelled)
  -> suggestion
  -> accept/reject
  -> transaction
```

### 7.6 取消与重试

- 浏览器 AbortController；
- `request.signal` 传给 Provider；
- cancel route 作为状态兜底；
- 网络错误、429 和部分 5xx 最多重试 2 次；
- refusal、schema 失败和取消不自动重试；
- 页面关闭不保证后台继续；
- 不引入 durable queue。

## 8. 编辑器与自动保存

编辑器维护：

- `serverContent`；
- `workingContent`；
- `baseRevision`；
- `saveState`；
- localStorage `recoveryDraft`。

自动保存：

1. 变化后标记 dirty；
2. debounce 800 至 1200ms；
3. 立即写 recovery；
4. PATCH Draft 并提交 revision；
5. 成功更新 revision；
6. 失败保留内容；
7. 409 进入 conflict UI。

同一 Draft 只允许一个 in-flight save。冲突不自动 merge。

AI 选区建议携带 draft revision、from/to 和文字 hash。接受时重新校验；失效返回 `STALE_AI_SUGGESTION`。

接受 AI 建议作为单个 CodeMirror transaction，使一次 Undo 能完整撤销。

## 9. Markdown 导出

1. 读取最新 Draft；
2. 校验标题；
3. 用 YAML serializer 生成 front matter；
4. 拼接正文；
5. 返回 UTF-8；
6. slug 或安全化标题作为文件名；
7. 不修改 Draft 状态。

不手写 YAML 插值，并测试中文、引号、多行摘要、代码块与 `---`。

## 10. 可靠性与安全

### 10.1 本地网络

- 默认绑定 `127.0.0.1`；
- 无认证时不监听 `0.0.0.0`；
- 自定义监听地址时警告；
- mutation same-origin；
- 不开放宽泛 CORS。

### 10.2 Markdown

- 不执行用户 HTML；
- sanitize；
- 安全外链属性；
- 不加载远程脚本。

### 10.3 日志

记录 request ID、route、generation ID、duration、model、token 与 error code；不记录完整 Fragment、Prompt、Draft、密钥或 SDK 原始响应。

### 10.4 备份

```text
pnpm db:backup
pnpm db:check
```

使用 SQLite 安全备份机制，不在活跃写入时直接复制文件。

## 11. 测试策略

### 11.1 单元测试

- Schema；
- service 规则；
- revision；
- AI 引用验证；
- Prompt serializer；
- Markdown 导出；
- retry 分类。

### 11.2 集成测试

- migration；
- CRUD；
- 外键；
- 多对多幂等；
- Question 回流 transaction；
- generation 接受 transaction；
- 并发 revision。

### 11.3 Route Handler Contract

- 请求和响应 schema；
- 状态码；
- Provider mock；
- cancel 和 timeout；
- Markdown header；
- 错误脱敏。

### 11.4 UI 与 E2E

覆盖 AC-01 至 AC-08。E2E 使用 MockAiProvider，不在 CI 调用真实模型。

### 11.5 Prompt Eval

评估 Groundedness、Ownership、原话保留、编造、候选差异、AI 味、帮助程度、延迟与成本。Ownership 和 AI 味由用户人工评分。

## 12. 命令与配置

```text
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm db:generate
pnpm db:migrate
pnpm db:backup
pnpm db:check
pnpm eval:prompts
```

环境变量：

```text
DATABASE_PATH=./data/chengzhang.db
AI_PROVIDER=openai
OPENAI_API_KEY=
AI_MODEL_PRIMARY=gpt-5.6-terra
AI_MODEL_FAST=gpt-5.6-terra
AI_REQUEST_TIMEOUT_MS=90000
```

CI 运行 format、lint、typecheck、unit、integration、production build、migration 和 Playwright 核心闭环。

## 13. v0.1 实施计划

### Slice 0：工程骨架与风险探针

- 初始化 Next.js App Router 与 TypeScript；
- 接入 lint、format、Vitest、Playwright；
- SQLite + Drizzle；
- CodeMirror 与 Markdown preview；
- MockAiProvider 和真实结构化请求；
- Route Handler streaming 与 AbortSignal；
- CI 和 README。

完成标准：应用可启动、数据库可 migrate、编辑器可输入、AI 探针通过。

### Slice 1：无 AI 内容闭环

- Capture 和 Fragment；
- Idea 与多对多关联；
- Draft、自动保存和 revision；
- Markdown preview 和导出；
- 本地备份；
- AC-01、AC-02、AC-08。

### Slice 2：方向与追问

- Provider；
- Generation；
- Claim；
- 素材分析；
- Question 回流；
- 错误、重试和取消；
- AC-03、AC-04。

### Slice 3：结构与初稿

- Outline；
- Fragment 分配；
- 初稿 stream；
- 接受、拒绝和 stale 防护；
- AC-05、AC-06。

### Slice 4：选区级 AI

- organize、expand、polish、feedback；
- selection hash；
- suggestion diff；
- accept/reject/undo；
- AC-07。

### Slice 5：真实文章

- 使用 10 至 30 条 Fragment；
- 修复保存、恢复、取消和导出；
- accessibility smoke test；
- backup/restore；
- prompt/model 对比；
- AC-09。

## 14. 需求追踪

| 需求 | Slice | 验证 |
| --- | --- | --- |
| FR-CAP | 1 | AC-01 |
| FR-IDEA | 1 | AC-02 |
| FR-AI | 2 | AC-03/04 |
| FR-OUT | 3 | AC-05 |
| FR-DRAFT-01 | 3 | AC-06 |
| FR-DRAFT-02/03 | 1 | UI + E2E |
| FR-DRAFT-04/05 | 4 | AC-07 |
| FR-EXP | 1 | AC-08 |
| 真实文章 | 5 | AC-09 |

## 15. v0.1 主要风险

### 15.1 Next.js 与 SQLite 被误用于 Serverless

Alpha 明确是本地 Node 进程，不部署到临时文件系统；未来云化通过 repository 迁移数据库。

### 15.2 AI Schema 正确但语义失真

结构验证与写作 eval 分开，由用户评估 Ownership 和 AI 味。

### 15.3 自动保存覆盖内容

使用 revision、单 in-flight save、localStorage recovery 和 conflict UI。

### 15.4 Generation 取消状态不一致

AbortSignal 贯穿客户端、Route Handler 和 Provider；结果始终只是 suggestion。

### 15.5 编辑器集成过重

先完成源码编辑和整篇 suggestion，再做选区 diff。

## 16. v0.1 明确推迟

- 认证与云数据库；
- durable queue；
- embeddings 和自动聚类；
- CRDT；
- 完整版本历史；
- CMS 发布；
- 多 Provider UI；
- 本地模型；
- 微服务和事件总线。

## 17. v0.1 开工默认值

1. `pnpm`；
2. Next.js App Router；
3. SQLite + Drizzle + `better-sqlite3`；
4. OpenAI；
5. `gpt-5.6-terra`；
6. Tailwind CSS；
7. Idea/Draft 一对一；
8. Prompt eval fixture 本地保存。

## 18. v0.1 官方参考

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Drizzle SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- [CodeMirror Documentation](https://codemirror.net/docs/)
- [OpenAI Model Guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)
