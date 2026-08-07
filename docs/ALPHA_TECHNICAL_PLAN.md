# 成章 Alpha：技术方案与实施计划

> 文档状态：技术方案基线
> 版本：0.2
> 更新日期：2026-08-07
> 对应需求：[ALPHA_REQUIREMENTS.md](./ALPHA_REQUIREMENTS.md)

## 1. 方案摘要

Alpha 采用一个本地运行的 TypeScript 全栈应用：

- **全栈框架**：TanStack Start；
- **路由**：TanStack Router 文件路由；
- **构建工具**：Vite；
- **服务端运行时**：Node.js LTS，使用 Nitro 生成 Node 产物；
- **服务端通信**：内部业务使用 TanStack Start Server Functions，原始 HTTP 响应使用 Server Routes；
- **服务端状态**：TanStack Query；
- **数据存储**：本地 SQLite；
- **数据库访问**：Drizzle ORM 与版本化 SQL migration；
- **Markdown 编辑**：CodeMirror 6；
- **Markdown 预览**：`react-markdown`、`remark-gfm` 和 HTML sanitize；
- **输入与 AI Schema**：Zod；
- **AI 接入**：服务端 Provider Adapter，默认实现 OpenAI Responses API；
- **测试**：Vitest、React Testing Library、Playwright；
- **运行形态**：单用户、本机进程，默认只监听 loopback 地址。

架构只服务 Alpha 的核心闭环：

```text
Fragment -> Idea -> Claim -> Outline -> Draft -> Markdown export
```

必须守住三个技术底线：

1. 原始 Fragment 不会被 AI 修改；
2. AI、网络或页面失败不会导致输入和正文丢失；
3. 框架、模型供应商和编辑器实现不渗透到领域规则中。

## 2. 关键技术决策

### 2.1 采用 TanStack Start 单体

TanStack Start 同时提供 TanStack Router、SSR、Server Functions、Server Routes、流式数据和全栈构建能力，适合 Alpha 的单进程应用形态。

选择理由：

- 前后端共享 TypeScript 类型和 Zod schema；
- Server Functions 适合应用内部的类型安全 RPC；
- Router loader 可以直接调用 Server Function，避免为页面读取重复写 HTTP client；
- Server Routes 可以处理 Markdown 下载、流式响应等原始 `Response`；
- TanStack Query 能统一 mutation、缓存失效、重试和客户端保存状态；
- 文件路由和生成的 route tree 能减少手写路由映射；
- 领域 service、repository 和 AI provider 仍可独立于框架测试。

TanStack Start 当前官方状态仍是 **Release Candidate**。Alpha 可以接受这一风险，但必须：

- 锁定精确依赖版本；
- 提交 lockfile；
- 不在开发中自动追随最新 RC；
- 升级前阅读 changelog 并单独提交；
- 在 Slice 0 验证 SQLite 原生模块、Server Function streaming、取消和 Node 构建产物；
- 不依赖未在官方文档中出现的内部 API。

### 2.2 Server Functions 与 Server Routes 的分工

#### 使用 Server Functions

应用内部的读取和 mutation：

- Fragment CRUD；
- Idea CRUD 与 Fragment 归属；
- Draft 读取与自动保存；
- 候选 Claim、素材分析、追问和 Outline；
- AI suggestion 的接受与拒绝；
- 完成状态切换。

Server Function 约定：

- 使用 `createServerFn`；
- 所有输入通过 Zod `.validator()` 做运行时校验；
- `.functions.ts` 只放网络边界；
- `.server.ts` 放数据库、AI SDK 和服务端专用实现；
- 客户端只静态 import Server Function，禁止动态 import；
- 预期业务错误返回受控 `Result`，不依赖解析异常文本；
- 每个读写私有数据的函数都经过同源和服务端边界检查。

#### 使用 Server Routes

需要完整控制 HTTP 的能力：

- `GET /exports/drafts/:draftId.md`：Markdown 文件下载；
- 需要自定义 content type 或 header 的诊断端点；
- 若 Server Function typed stream 在风险探针中不满足取消要求，则 AI 长文本流降级为专用 Server Route。

Alpha 不建设对外公共 REST API。Server Routes 不是另一套领域实现，只负责将 HTTP 请求映射到同一 application service。

### 2.3 路由加载与客户端状态

- 页面首屏数据由 TanStack Router loader 调用读 Server Function；
- URL 参数和 search params 由 Router 的类型系统和 Zod 校验；
- mutation 和刷新使用 TanStack Query；
- Query key 按领域实体集中定义，不能在组件中任意拼字符串；
- mutation 成功后优先精确更新 cache，必要时再 invalidate；
- 编辑器正文不以 Query cache 作为每次按键的状态容器；
- Draft 工作副本保留在编辑器本地状态，服务端成功保存后再同步 Query cache。

### 2.4 使用 SQLite 与 Drizzle

Alpha 是单用户本地应用，SQLite 不需要额外服务，且能提供事务、外键、索引和可备份文件。

数据库配置：

- 默认文件：`data/chengzhang.db`；
- 启用 `PRAGMA foreign_keys = ON`；
- 启用 WAL；
- 配置 busy timeout；
- `data/` 加入 `.gitignore`；
- migration 文件提交 Git；
- 测试使用独立临时数据库；
- 所有跨表更新在 transaction 中完成。

Drizzle 使用代码优先 schema 和可审查 SQL migration：

- `src/server/db/schema.ts` 是 schema 入口；
- `drizzle/` 保存 migration；
- `drizzle-kit generate` 生成 migration；
- `drizzle-kit migrate` 应用 migration；
- 不把 `push` 作为正式升级路径；
- CI 验证空库 migration 和上一版 fixture 升级。

首选 SQLite driver 为 `better-sqlite3`。它必须只从 `.server.ts` 或服务端入口 import，避免进入客户端 bundle。Slice 0 要验证 Vite/Nitro 是否正确 externalize 原生模块；若不稳定，再切换 Drizzle 支持的 `node:sqlite`，repository 接口保持不变。

### 2.5 Markdown 采用源码编辑

- CodeMirror 6 编辑 Markdown 源码；
- `react-markdown` 负责预览；
- `remark-gfm` 支持常用 GFM；
- 默认跳过或 sanitize 原始 HTML；
- CodeMirror 通过薄适配层暴露 `value`、selection、transaction 和 undo；
- Draft 领域类型不依赖 CodeMirror 类型。

### 2.6 AI 使用 Provider Adapter

领域层只依赖以下抽象：

```ts
interface AiProvider {
  generateObject<T>(request: StructuredRequest<T>): Promise<AiResult<T>>;
  generateText(request: TextRequest): Promise<AiResult<string>>;
  streamText(request: TextRequest): AsyncIterable<AiTextEvent>;
}
```

默认实现使用 OpenAI Responses API，但以下内容全部通过配置或 adapter 隔离：

- provider；
- model；
- reasoning；
- timeout；
- token 上限；
- structured output 具体 SDK 调用；
- provider 错误类型。

模型初始基线：

- `claim`、`analysis`、`outline`、`draft`：`gpt-5.6-terra` + medium reasoning；
- `organize`、`polish`、`feedback`：同一模型 + low reasoning；
- 是否升级部分任务到 `gpt-5.6-sol`，只根据真实中文写作 eval 决定。

## 3. 系统结构

```text
Browser
  |
  | navigation / Server Function RPC / stream / file download
  v
TanStack Start
  +-- TanStack Router loaders and routes
  +-- TanStack Query mutations and cache
  +-- Server Functions
  +-- Server Routes
  +-- Middleware / request context
  |
  +-- Application Services
  |     +-- Fragment Service
  |     +-- Idea Service
  |     +-- Draft Service
  |     +-- Generation Service
  |     +-- Export Service
  |
  +-- AI Orchestrator ----> AiProvider ----> OpenAI API
  |
  +-- Repositories -------> Drizzle -------> SQLite
```

### 3.1 UI 层

负责：

- 页面与交互；
- 客户端即时校验；
- Query mutation 和缓存；
- 编辑工作副本；
- localStorage 恢复；
- AI suggestion 的展示、接受和拒绝。

不负责：

- 数据库查询；
- Prompt 拼接；
- Provider SDK 调用；
- 跨实体 transaction；
- 通过自然语言错误判断业务分支。

### 3.2 Server Function 层

负责：

- 网络边界输入验证；
- 调用 application service；
- 获取请求和 AbortSignal；
- 将可预期领域错误映射为 typed result；
- 添加 no-store 等必要 response header；
- 不泄漏堆栈和服务端配置。

### 3.3 Application Service 层

负责：

- 领域规则；
- transaction 边界；
- revision 冲突；
- 删除影响范围；
- generation 生命周期；
- 接受 AI 建议后的实体更新。

Service 不 import TanStack Start、React 或路由类型。

### 3.4 Repository 层

- 封装 Drizzle 查询；
- 返回领域 record；
- 不把 query builder 暴露给 service；
- 不包含 Prompt、UI 文案或 HTTP 状态码。

### 3.5 AI Orchestrator

- 选择 operation、schema 和 model policy；
- 从数据库装配最小上下文；
- 创建 generation 记录；
- 处理 timeout、取消、拒绝和结构化解析；
- 验证模型引用的 Fragment ID；
- 记录耗时与 token usage；
- 只返回 suggestion，不直接改 Draft。

### 3.6 Middleware 与 request context

如果项目定义自有 `src/start.ts`，必须显式加入 TanStack Start 的 CSRF middleware。全局 request middleware 负责：

- request ID；
- 同源保护；
- 安全响应头；
- 结构化请求日志；
- 统一的未捕获错误脱敏。

Alpha 没有用户认证。默认绑定 loopback 是实际安全边界，不能用路由 `beforeLoad` 冒充数据访问保护。

## 4. 目录结构

```text
.
├── docs/
├── drizzle/
├── data/                              # gitignored
├── public/
├── scripts/
│   ├── backup-db.ts
│   ├── check-db.ts
│   └── run-prompt-evals.ts
├── src/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx                  # Capture / Inbox
│   │   ├── ideas.index.tsx
│   │   ├── ideas.$ideaId.tsx
│   │   ├── drafts.$draftId.tsx
│   │   └── exports.drafts.$draftId[.]md.ts
│   ├── routeTree.gen.ts               # generated, do not edit
│   ├── router.tsx
│   ├── start.ts
│   ├── server.ts
│   ├── components/
│   │   ├── capture/
│   │   ├── ideas/
│   │   ├── editor/
│   │   ├── ai-suggestions/
│   │   └── ui/
│   ├── features/
│   │   ├── fragments/
│   │   │   ├── fragments.functions.ts
│   │   │   ├── fragments.queries.ts
│   │   │   └── fragments.components.tsx
│   │   ├── ideas/
│   │   ├── drafts/
│   │   └── generations/
│   ├── modules/
│   │   ├── fragments/
│   │   ├── ideas/
│   │   ├── drafts/
│   │   ├── generations/
│   │   └── export/
│   ├── server/
│   │   ├── ai/
│   │   │   ├── provider.ts
│   │   │   ├── openai-provider.server.ts
│   │   │   ├── orchestrator.server.ts
│   │   │   ├── model-policy.ts
│   │   │   ├── prompts/
│   │   │   └── schemas/
│   │   ├── db/
│   │   │   ├── client.server.ts
│   │   │   ├── schema.ts
│   │   │   └── migrate.server.ts
│   │   └── observability/
│   ├── shared/
│   │   ├── errors.ts
│   │   ├── ids.ts
│   │   └── result.ts
│   └── test/
├── e2e/
├── .env.example
├── drizzle.config.ts
├── vite.config.ts
└── package.json
```

约定：

- `*.functions.ts`：可由客户端静态 import 的 Server Function wrapper；
- `*.server.ts`：绝不进入客户端 bundle 的实现；
- `*.queries.ts`：Query key 和 query/mutation option 工厂；
- `modules/`：框架无关领域逻辑；
- `routeTree.gen.ts`：由 TanStack Router 插件生成，不手动编辑；
- 不引入 dependency injection container、event bus 或通用 DDD framework。

## 5. 数据模型

### 5.1 通用规则

- 主键使用 UUID v7 或应用生成的有序字符串 ID；
- 时间在数据库统一使用 integer epoch，API 输出 ISO 8601；
- 用户可编辑实体包含 `revision`；
- 更新携带 `baseRevision`；
- revision 不一致返回 `REVISION_CONFLICT`；
- Alpha 使用硬删除，删除前先展示影响范围；
- API key 不进入数据库。

### 5.2 `fragments`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| content | text | not null，trim 后非空 |
| revision | integer | not null，default 1 |
| created_at | integer | not null |
| updated_at | integer | not null |

索引：`created_at desc`。

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

Idea 当前阶段由数据推导，不增加用户手动维护的状态。

### 5.4 `idea_fragments`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| idea_id | text | FK -> ideas，cascade delete |
| fragment_id | text | FK -> fragments，cascade delete |
| position | integer | nullable |
| created_at | integer | not null |

主键：`(idea_id, fragment_id)`。批量加入使用 transaction 和幂等插入。

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

回答追问时，在一个 transaction 中创建 Fragment、建立 Idea 关联、回填答案并更新 Idea revision。

### 5.6 `drafts`

Alpha 选择一个 Idea 最多对应一个 Draft。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| idea_id | text | FK -> ideas，unique，restrict delete |
| title | text | not null |
| description | text | nullable |
| slug | text | nullable |
| tags_json | text | not null，default `[]` |
| outline_json | text | not null，带 schemaVersion |
| content | text | not null，default empty |
| status | text | drafting/completed |
| revision | integer | not null，default 1 |
| created_at | integer | not null |
| updated_at | integer | not null |

Outline 结构：

```ts
type Outline = {
  schemaVersion: 1;
  title: string;
  approach: string;
  sections: Array<{
    id: string;
    title: string;
    purpose: string;
    fragmentIds: string[];
    missingMaterial: string[];
  }>;
};
```

### 5.7 `ai_generations`

执行状态和用户处理状态分离。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | text | primary key |
| operation | text | claim/analysis/questions/outline/draft/organize/expand/polish/feedback |
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
| retry_of_id | text | nullable |
| error_code | text | nullable |
| error_message | text | nullable，必须脱敏 |
| input_tokens | integer | nullable |
| output_tokens | integer | nullable |
| started_at | integer | not null |
| completed_at | integer | nullable |
| resolved_at | integer | nullable |

规则：

- generation append-only；
- 不保存密钥、Authorization header 和 SDK 原始异常；
- 接受建议时，在 transaction 中同时修改目标实体和 generation resolution；
- 重试创建新 generation；
- 输入快照只保留当前任务实际使用的内容。

## 6. Server Function 契约

### 6.1 标准 Result

预期业务错误返回可序列化判别联合：

```ts
type AppResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: AppErrorCode;
        message: string;
        retryable: boolean;
        requestId: string;
        details?: Record<string, unknown>;
      };
    };
```

典型错误码：

- `VALIDATION_ERROR`；
- `NOT_FOUND`；
- `REVISION_CONFLICT`；
- `DELETE_RESTRICTED`；
- `AI_UNAVAILABLE`；
- `AI_REFUSAL`；
- `AI_OUTPUT_INVALID`；
- `AI_TIMEOUT`；
- `STALE_AI_SUGGESTION`；
- `CANCELLED`。

未预期错误由全局错误边界记录，并返回通用错误，不向客户端暴露 stack。

### 6.2 Fragment Functions

| Function | Method | 用途 |
| --- | --- | --- |
| `listFragments` | GET | cursor 列表和 unassigned 筛选 |
| `createFragment` | POST | 创建 Fragment |
| `updateFragment` | POST | 带 revision 编辑 |
| `previewDeleteFragment` | GET | 返回关联影响 |
| `deleteFragment` | POST | 确认后删除 |

### 6.3 Idea Functions

| Function | Method | 用途 |
| --- | --- | --- |
| `listIdeas` | GET | Idea 列表 |
| `getIdeaWorkspace` | GET | 一次返回工作区所需数据 |
| `createIdea` | POST | 可带 fragmentIds 创建 |
| `updateIdea` | POST | 名称、说明、确认主张 |
| `deleteIdea` | POST | 无 Draft 时删除 |
| `addIdeaFragments` | POST | 批量加入 |
| `removeIdeaFragment` | POST | 移出关联 |
| `answerIdeaQuestion` | POST | 回答并创建 Fragment |
| `dismissIdeaQuestion` | POST | 忽略追问 |

### 6.4 Draft Functions

| Function | Method | 用途 |
| --- | --- | --- |
| `createDraft` | POST | 从已选 Outline 创建 |
| `getDraft` | GET | 读取草稿 |
| `saveDraft` | POST | 自动保存正文、结构或元数据 |
| `completeDraft` | POST | 标记完成 |
| `reopenDraft` | POST | 恢复 drafting |

### 6.5 AI Functions

| Function | 输出 |
| --- | --- |
| `generateClaims` | 结构化候选主张 |
| `analyzeIdea` | 支持、矛盾、重复、缺口 |
| `generateQuestions` | 追问并持久化 |
| `generateOutlines` | 结构方案 |
| `generateDraftStream` | typed stream 或 AsyncIterable |
| `organizeSelection` | 修改 suggestion |
| `expandSelection` | 修改 suggestion |
| `polishSelection` | 修改 suggestion |
| `getDraftFeedback` | 结构化反馈 |
| `acceptGeneration` | 带 revision 接受建议 |
| `rejectGeneration` | 拒绝建议 |
| `cancelGeneration` | 协作取消 |

### 6.6 原始 Server Route

`GET /exports/drafts/$draftId.md`：

- 读取最新 Draft；
- 校验标题和元数据；
- 生成 UTF-8 Markdown；
- 返回 `text/markdown; charset=utf-8`；
- 设置安全 `Content-Disposition`；
- 不改变 Draft 状态。

## 7. AI Orchestrator

### 7.1 具名操作，不做通用聊天

每种 AI 能力对应独立 operation、prompt 和输出 schema。每次调用从数据库最新状态构造上下文，不维护不断增长的聊天历史。

Prompt 组成：

```text
Base authorship policy
  + operation instruction
  + output contract
  + Idea and confirmed Claim
  + selected Fragment blocks with IDs
  + relevant Outline or Draft selection
  + explicit user instruction
```

Fragment 序列化：

```text
<fragment id="frag_123" created_at="2026-08-06T08:00:00Z">
用户原始内容……
</fragment>
```

### 7.2 Prompt 版本

```text
prompts/
  base-authorship.v1.ts
  claim.v1.ts
  analysis.v1.ts
  questions.v1.ts
  outline.v1.ts
  draft.v1.ts
  organize.v1.ts
  expand.v1.ts
  polish.v1.ts
  feedback.v1.ts
```

每次 generation 保存 prompt version。Prompt 修改必须运行 contract test 和真实样例 eval。

### 7.3 结构化输出

Claim 示例：

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

模型 schema 只保证形状，应用层仍需验证：

- 引用的 Fragment 属于当前输入；
- candidates 数量和 `canFormClaim` 一致；
- 无效 enum、空内容和重复项；
- 结果与当前 Idea revision 对应。

### 7.4 上下文预算

- 10 至 30 条 Fragment 时发送当前 Idea 全部原文；
- 超过阈值时让用户选择，不在 Alpha 引入向量检索；
- 不用 AI 摘要替代原始 Fragment；
- 选区操作只发送选区、必要上下文和相关 Fragment；
- 记录 token 后再根据真实瓶颈优化。

### 7.5 生命周期

```text
validate
  -> load entity + revision
  -> build input snapshot
  -> insert generation(pending)
  -> call provider with timeout and AbortSignal
  -> validate output
  -> generation(succeeded | failed | cancelled)
  -> return suggestion
  -> user accept/reject
  -> transactional mutation + resolution
```

### 7.6 Streaming

优先使用 TanStack Start Server Function 的 typed `ReadableStream` 或 async generator：

- chunk 只进入客户端 suggestion buffer；
- 流式过程中不自动保存到 Draft；
- 完成后服务端保存完整 generation output；
- 用户接受后才更新 Draft；
- 客户端用 AbortController 取消；
- 服务端从当前 Request 获取 signal 并传给 provider。

Slice 0 若发现 Server Function stream 无法可靠感知断开或设置所需 header，则使用 Server Route 返回 Web `ReadableStream`。这只是 transport 替换，不改变 orchestrator 和 generation 模型。

### 7.7 重试与取消

- 网络错误、429 和部分 5xx 最多自动重试 2 次；
- 指数退避并带 jitter；
- refusal、schema 失败和用户取消不自动重试；
- 每个 operation 有独立 timeout；
- 页面关闭后不保证后台继续；
- Alpha 不引入 durable queue；
- 即使迟到的生成成功，也只是 pending suggestion，不自动改变正文。

### 7.8 隐私

- API key 只在 `.server.ts` 使用；
- 只发送完成当前操作所需内容；
- 不使用供应商会话作为业务真相来源；
- 不依赖 `previous_response_id` 保存产品状态；
- 普通日志不记录完整 Fragment、Prompt 或 Draft；
- 首次使用 AI 前显示内容将发送到配置供应商的说明。

## 8. 编辑器与自动保存

### 8.1 编辑状态

- `serverContent`：最近服务端确认内容；
- `workingContent`：当前编辑器内容；
- `baseRevision`：保存基准；
- `saveState`：idle/dirty/saving/saved/failed/conflict；
- `recoveryDraft`：localStorage 未确认副本。

### 8.2 自动保存

1. 输入后立即标记 dirty；
2. 同步写 localStorage recovery；
3. debounce 800 至 1200ms；
4. 调用 `saveDraft({ baseRevision, patch })`；
5. 成功后更新 revision 并清理对应 recovery；
6. 失败时保留工作副本和 recovery；
7. 409 时停止覆盖并进入 conflict UI。

同一 Draft 只允许一个 in-flight save。保存期间出现新输入，当前保存成功后再发送下一版。

### 8.3 冲突

多标签页冲突时提供：

- 查看服务端版本；
- 复制当前本地版本；
- 使用服务端版本；
- 明确确认后强制覆盖。

Alpha 不自动 merge 文本。

### 8.4 AI suggestion 定位

选区操作携带：

- `draftRevision`；
- selection `from`、`to`；
- 选中文字 hash；
- 必要上下文窗口。

接受时重新校验 revision、hash 和 generation resolution。不匹配返回 `STALE_AI_SUGGESTION`，不得盲目替换。

### 8.5 Undo

接受 AI 建议作为一个 CodeMirror transaction，使一次 Undo 完整撤销。Alpha 不持久化完整 undo history；刷新后不保证一键撤销历史任意编辑。

## 9. Markdown 导出

流程：

1. Server Route 读取最新 Draft；
2. 校验标题；
3. 使用 YAML serializer 生成 front matter；
4. 拼接 Markdown 正文；
5. 返回 UTF-8 下载；
6. 文件名优先 slug，否则安全化标题；
7. 不修改完成或发布状态。

安全要求：

- 不手写 YAML 字符串插值；
- 防止标题构造额外 front matter；
- 文件名移除路径分隔符和控制字符；
- 空字段不输出；
- 测试中文、引号、多行摘要、代码块和 `---`。

## 10. 本地运行、安全与可靠性

### 10.1 Node 运行

使用 Vite + Nitro Node 输出：

```text
pnpm build
node .output/server/index.mjs
```

具体输出路径以 Slice 0 实际生成结果为准，并固化在 `package.json`。Alpha 不部署到无持久文件系统的 Serverless 环境。

### 10.2 网络边界

- 默认绑定 `127.0.0.1`；
- 无认证时禁止默认监听 `0.0.0.0`；
- 自定义监听地址时打印安全警告；
- Server Functions 使用 CSRF middleware；
- 不开启宽泛 CORS；
- Server Routes 同样只服务 same-origin 本地应用。

### 10.3 Markdown 安全

- 不执行原始 HTML；
- 预览使用安全 URL transform 和 sanitize；
- 外链加安全属性；
- 不加载远程脚本；
- 远程图片在 Alpha 可禁用或提示隐私风险。

### 10.4 日志

记录：

- request ID；
- Server Function/Route 名称；
- generation ID；
- duration；
- provider/model；
- token usage；
-稳定 error code。

默认不记录：

- Fragment 和 Draft 全文；
- 完整 Prompt；
- API key 和 Authorization header；
- Provider 原始异常对象。

### 10.5 数据备份

提供：

```text
pnpm db:backup
pnpm db:check
```

`db:backup` 使用 SQLite 安全备份机制生成 `data/backups/<timestamp>.db`；`db:check` 运行 integrity check 和 foreign key check。不能在活跃写入时直接复制数据库文件。

## 11. 测试策略

### 11.1 单元测试

- Zod schema；
- service 业务规则；
- revision 冲突；
- AI 引用校验；
- Prompt context serializer；
- Markdown front matter 和文件名；
- model policy；
- retry 分类。

### 11.2 Repository 集成测试

使用临时 SQLite：

- migration；
- CRUD；
- foreign key、cascade 和 restrict；
- 多对多幂等插入；
- 回答 Question transaction；
- 接受 generation transaction；
- revision 并发更新。

### 11.3 Server Function 测试

- validator；
- typed result；
- service 调用；
- no-store；
- Provider mock；
- timeout、cancel 和 retry；
- 不泄漏服务端异常。

Server Function wrapper 保持很薄，核心逻辑在 service 测试。

### 11.4 Router 测试

- route loader；
- params 与 search schema；
- pending/error/not-found boundary；
- 生成 route tree 后的路径类型；
-导航与 cache invalidation。

### 11.5 UI 测试

- Capture 快捷键和换行；
- 保存失败保留内容；
- Fragment 多选；
- suggestion 接受/拒绝；
- 自动保存状态；
- conflict UI；
- 键盘焦点。

### 11.6 Playwright E2E

使用固定 MockAiProvider，不调用真实模型：

1. 连续捕捉；
2. 创建 Idea 并关联 Fragment；
3. 生成和确认 Claim；
4. 回答 Question 回流；
5. 选择 Outline；
6. 创建、编辑并恢复 Draft；
7. 接受和撤销 AI 修改；
8. 下载并解析 Markdown。

### 11.7 Prompt Eval

`pnpm eval:prompts` 使用 gitignored 的真实或脱敏素材，记录：

- Groundedness；
- Ownership；
- 原话保留；
- 是否编造；
- 候选差异；
- AI 味；
- 实际帮助程度；
- 延迟、token 与估算成本。

Ownership、AI 味和帮助程度必须由用户人工评分。

## 12. 开发命令与配置

### 12.1 命令

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

### 12.2 环境变量

```text
DATABASE_PATH=./data/chengzhang.db
HOST=127.0.0.1
PORT=3000
AI_PROVIDER=openai
OPENAI_API_KEY=
AI_MODEL_PRIMARY=gpt-5.6-terra
AI_MODEL_FAST=gpt-5.6-terra
AI_REQUEST_TIMEOUT_MS=90000
```

`.env.local` 必须 gitignore。浏览器代码只能读取显式公开前缀的变量，密钥不能使用公开前缀。

### 12.3 CI

- format check；
- lint；
- TypeScript typecheck；
- unit 和 integration test；
- 生成 route tree 后确认工作区无意外 diff；
- production build；
- 空库 migration；
- Playwright 核心闭环。

真实模型 eval 不在普通 CI 中运行，但 Prompt 或 model policy 变更前必须手动运行并保存摘要。

## 13. 实施计划

### Slice 0：框架骨架与风险探针

目标：在正式功能前确认 TanStack Start RC 与本地原生依赖可用。

任务：

- 使用官方 TanStack Start 脚手架初始化 Vite 项目；
- 锁定版本并提交 pnpm lockfile；
- 建立 Router 文件路由、Query、Vitest 和 Playwright；
- 配置 `src/start.ts`、CSRF middleware 和 request ID；
- 配置 Nitro Node build；
- 接入 Drizzle + better-sqlite3 和最小 migration；
- 验证开发与 production build 都能读写 SQLite；
- 检查原生模块未进入 client bundle；
- 验证 CodeMirror、Markdown preview 和一次 Undo transaction；
- 实现 MockAiProvider；
- 验证真实结构化 AI 请求；
- 验证 Server Function typed stream、AbortSignal 和取消；
- 验证 Markdown Server Route 下载；
- 建立 CI 和根 README。

必须得到明确结论：

- 当前锁定版 Start 的 Server Function API 是否稳定满足需求；
- Nitro Node 产物的准确启动命令；
- better-sqlite3 是否需要 Vite/Nitro external 配置；
- typed stream 中断是否能取消 Provider 请求；
- Server Function 的异常序列化是否符合受控错误协议。

完成标准：开发和生产构建均可启动、数据库可 migrate、AI mock/真实探针通过、stream 可取消。

### Slice 1：无 AI 内容闭环

对应：FR-CAP、FR-IDEA、FR-DRAFT-02/03、FR-EXP。

- Capture / Inbox；
- localStorage 输入恢复；
- Fragment CRUD 和筛选；
- Idea CRUD；
- Fragment 多对多归属；
- 一个 Idea 一个 Draft；
- Markdown 编辑、自动保存和预览；
- revision 冲突 UI；
- Markdown Server Route 导出；
- 数据库备份脚本；
- AC-01、AC-02、AC-08 E2E。

完成标准：不调用 AI 也能手动从 Fragment 创建并导出文章。

### Slice 2：方向与追问

对应：FR-AI-01 至 FR-AI-05。

- Provider Adapter 和 OpenAI 实现；
- generation 表与生命周期；
- base authorship policy；
- Candidate Claim；
- Claim 确认和 stale 提示；
- 支持、矛盾、重复和缺口分析；
- Question 保存、忽略和回答回流；
- refusal、timeout、retry 和 cancel；
- prompt fixture 和真实 eval；
- AC-03、AC-04 E2E。

完成标准：用户能确认有素材依据的主张，并通过追问产生新 Fragment。

### Slice 3：结构与初稿

对应：FR-OUT、FR-DRAFT-01。

- Outline schema 和多个结构方案；
- 结构差异与缺失素材展示；
- Outline 编辑、排序和 Fragment 分配；
- 创建 Draft；
- 初稿 typed stream；
- 初稿接受/拒绝；
- stale suggestion 防护；
- AC-05、AC-06 E2E。

完成标准：从 Claim 形成结构和 Markdown 草稿，素材不足之处不会被空话隐藏。

### Slice 4：选区级 AI 协作

对应：FR-DRAFT-04/05。

- selection anchor 和 text hash；
- organize、expand、polish、feedback；
- suggestion diff 或并排预览；
- accept/reject；
- 单 transaction 应用和 Undo；
- stale suggestion 冲突；
- generation resolution；
- AC-07 E2E。

完成标准：AI 建议确认前不进入正文，接受后可一次撤销，过期建议不能错误应用。

### Slice 5：真实文章与 Alpha 加固

- 使用 10 至 30 条真实 Fragment 完成文章；
- 记录各 AI operation 的质量与阻塞点；
- 修复保存、恢复、取消和导出问题；
- 完成键盘和窄屏核心流程；
- accessibility smoke test；
- backup/restore 演练；
- model/prompt 对比；
- 编写 Alpha 已知限制；
- 完成 AC-09。

完成标准：真实文章成功导出、数据库可恢复、全部 Alpha E2E 通过，并能开始第二篇文章。

## 14. 需求追踪

| 需求 | Slice | 验证 |
| --- | --- | --- |
| FR-CAP-01 ~ 05 | 1 | unit + UI + AC-01 |
| FR-IDEA-01 ~ 04 | 1 | integration + AC-02 |
| FR-AI-01 ~ 05 | 2 | contract + prompt eval + AC-03/04 |
| FR-OUT-01 ~ 03 | 3 | contract + UI + AC-05 |
| FR-DRAFT-01 | 3 | prompt eval + AC-06 |
| FR-DRAFT-02 ~ 03 | 1 | UI + E2E |
| FR-DRAFT-04 ~ 05 | 4 | contract + AC-07 |
| FR-EXP-01 ~ 02 | 1 | unit + AC-08 |
| 错误与取消 | 0/2 | integration |
| 可靠性与备份 | 1/5 | restore drill |
| 真实文章 | 5 | 人工复盘 |

## 15. 主要风险

### 15.1 TanStack Start 仍处 RC

风险：API 或构建配置发生变化。

应对：锁定版本、提交 lockfile、Slice 0 探针、升级单独提交、不使用内部 API，并把业务逻辑隔离在框架外。

### 15.2 Nitro 与 SQLite 原生模块

风险：production build 错误打包 `better-sqlite3`，或部署环境没有持久文件系统。

应对：只在 `.server.ts` import、验证 client bundle、配置 external、production smoke test；必要时切换 `node:sqlite`。Alpha 只支持本地 Node，不支持临时 Serverless 文件系统。

### 15.3 Server Function stream 取消不可靠

应对：Slice 0 验证 Request signal；不满足时改用 Server Route Web Stream。AI 结果始终只是 suggestion，迟到也不改正文。

### 15.4 Schema 正确但文章质量差

应对：结构验证与语义 eval 分开，检查 Fragment 引用，建立中文真实素材集，并由用户评分 Ownership 和 AI 味。

### 15.5 自动保存覆盖内容

应对：revision 锁、单 in-flight save、localStorage recovery、冲突 UI、AI 接受时复查 selection hash。

### 15.6 编辑器集成过重

应对：Slice 1 先做纯 Markdown；Slice 3 先接受整篇初稿；Slice 4 才加入选区 diff，不建设完整审阅系统。

## 16. 明确推迟

- 用户认证与云部署；
- 云数据库和对象存储；
- durable queue 和 worker；
- embeddings、向量数据库和自动聚类；
- CRDT 与实时协同；
- 完整版本历史；
- CMS 与博客发布 adapter；
- 多 Provider 配置 UI；
- 本地模型；
- 端到端加密；
- 微服务、事件总线和插件系统；
- 产品分析平台。


## 17. 开工默认值

1. 包管理器：`pnpm`；
2. 框架：TanStack Start + Vite；
3. 服务端产物：Nitro Node；
4. 数据库：SQLite + Drizzle + `better-sqlite3`；
5. 模型供应商：OpenAI；
6. 模型基线：`gpt-5.6-terra`；
7. 样式：Tailwind CSS + 自有基础组件；
8. Idea/Draft：一对一；
9. Prompt eval 数据：本地 gitignored fixture。

这些默认值足以直接开始 Slice 0。

## 18. 官方参考

- [TanStack Start Overview](https://tanstack.com/start/latest/docs/framework/react/overview)
- [TanStack Start Routing](https://tanstack.com/start/latest/docs/framework/react/guide/routing)
- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)
- [Streaming Data from Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/streaming-data-from-server-functions)
- [TanStack Start Server Entry Point](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point)
- [TanStack Start Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [TanStack Router File-Based Routing](https://tanstack.com/router/latest/docs/routing/file-based-routing)
- [Drizzle SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- [CodeMirror Documentation](https://codemirror.net/docs/)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
