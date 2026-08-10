# 成章 Alpha：需求与技术方案 Review

> 文档状态：设计评审记录（只读意见，不构成已决议）  
> 日期：2026-08-07  
> 评审对象：  
> - [PRODUCT_SPEC.md](./PRODUCT_SPEC.md)  
> - [ALPHA_REQUIREMENTS.md](./ALPHA_REQUIREMENTS.md)  
> - [ALPHA_TECHNICAL_PLAN.md](./ALPHA_TECHNICAL_PLAN.md)  
> - [POST_ALPHA_BACKLOG.md](./POST_ALPHA_BACKLOG.md)  
> - [README.md](./README.md)  

本文只记录评审结论与建议。**不自动修改**上述基线文档；落地时再按优先级回写需求/技术方案。

---

## 1. 总评

| 维度 | 分数（主观） | 说明 |
| --- | --- | --- |
| 问题与定位 | 9/10 | 差异化清楚，不做笔记软件 / SEO 写手 |
| Alpha 范围控制 | 9/10 | 砍得狠且砍对了 |
| 需求可验收性 | 8.5/10 | AC-01~09 可测；NFR 偏软 |
| 技术方案完整度 | 8/10 | 远超一般基线；Outline 落点与 schema 笔误拖分 |
| 文档一致性 | 7/10 | 术语 / Slice / 开放决策 / 死链需一轮对齐 |
| 可开工性 | 8.5/10 | 默认值足够启动 Slice 0 |

**结论：** 文档已具备「按切片交付 Alpha」的质量。不必再扩愿景；开工前优先收掉 **Outline 何时落库**、**时间字段笔误**、**换主张 / 删除的级联策略**。

---

## 2. 文档体系与产品理解

| 文档 | 角色 | 评价 |
| --- | --- | --- |
| `PRODUCT_SPEC` | 长期愿景 + MVP 大图 | 问题定义扎实；原则（零组织捕捉、先理解后写作、保留矛盾）是核心差异化 |
| `ALPHA_REQUIREMENTS` | 首版契约 | 将 Thread 收敛为 **Idea**，砍掉自动聚类 / 发布 / 合并拆分，聚焦「一篇真文章」——正确 |
| `ALPHA_TECHNICAL_PLAN` | 实现基线 | 分层、generation 生命周期、revision、流式取消、导出安全都写到可落地程度 |
| `POST_ALPHA_BACKLOG` | 需求池 | 与 Alpha 解耦得好，进入信号清晰 |
| `README` | 索引 | 阅读顺序合理；**指向已不存在的 archive** |

核心闭环在三份主文档中一致：

```text
Fragment → Idea → Claim → Outline → Draft → Markdown export
```

优先级约定正确：冲突时以 `ALPHA_REQUIREMENTS` 为准。

---

## 3. 做得好的地方

### 3.1 产品侧

- **验证问题可测**：不是「AI 写不写得好」，而是「记录 + 少量关键判断 → 仍属于自己的文章」。
- **ADHD / 非线性思考当设计约束**，不当唯一市场标签。
- **AI 边界写进需求而非口号**：禁止编造经历、禁止捕捉后打断、素材不足要暴露而非填空。
- Alpha 明确不做 CMS / 自动归属 / 知识图谱，避免 MVP 变笔记软件。

### 3.2 技术侧

- **领域与框架隔离**（`modules/` + thin server functions）适合 TanStack Start 快速演进。
- **`ai_generations` 执行态 / 用户处理态分离** + append-only，是正确建模。
- **AI 结果只进 suggestion，accept 才改实体**，配合 revision + selection hash，防覆盖路径完整。
- **无 AI 也能闭环**（Slice 1）降低模型可用性风险。
- 测试分层（unit → repo → SF → E2E mock → 人工 prompt eval）与「中文 Ownership 人工评」匹配产品本质。
- 导出不用手拼 YAML、文件名净化——容易漏却写到了。

---

## 4. 问题与风险（按严重度）

### P0 — 建议开工前拍板

#### 4.1 Outline 生命周期与数据落点不一致

需求（`FR-OUT-01~03` → `FR-DRAFT-01`）隐含流程：

1. 确认 Claim 后生成 2–3 个结构  
2. **选择并编辑结构（需自动保存）**  
3. 再「确认结构后创建 Draft」

技术方案：

- `outline_json` **只挂在 `drafts` 上**  
- `createDraft` =「从已选 Outline 创建」  
- generation 可存 outline 输出，但**编辑后的 outline 在 Draft 创建前存在哪**未定义  

结果：用户改完章节排序 / Fragment 分配后刷新可能丢编辑；或被迫「一选结构就建 Draft」，与「先结构后成稿」的渐进 IA 表述冲突。

**建议三选一（推荐 A）：**

| 方案 | 做法 | 利弊 |
| --- | --- | --- |
| **A（推荐）** | 用户选定某个 outline 方案时即 `createDraft`（`content` 可空），后续结构编辑一律走 `saveDraft` | 模型简单，与「一对一 Draft」一致 |
| B | Idea 上增加 `working_outline_json`，或独立 `outlines` 表 | 更贴「结构阶段独立」，但多一套状态机 |
| C | 结构编辑只存在 client + generation，创建 Draft 时一次性写入 | 实现省，**刷新即丢**，不满足 FR-OUT-02 自动保存 |

需求里「Idea 与 Draft 一对一还是一对多」仍为开放决策；技术文档已定一对一。落地时建议在需求中关闭该决策，并写清 **Outline 从哪一刻起持久化**。

#### 4.2 Schema 时间字段类型错误

| 字段 | 技术方案当前写法 | 问题 |
| --- | --- | --- |
| `idea_questions.dismissed_at` | `integer` | 同表 `created_at` 为 `timestamptz`，语义是时间 |
| `ai_generations.completed_at` | `integer` | 同表 `started_at` / `resolved_at` 为 `timestamptz` |

几乎可以肯定是笔误；实现时应统一为 `timestamptz`（nullable）。

#### 4.3 文档索引与仓库状态脱节

`docs/README.md` 仍引用：

```text
./archive/ALPHA_TECHNICAL_PLAN_V0.1_NEXTJS.md
```

工作区无 `docs/archive/`（该文件在仓库中已删除）。读者会踩 404。应删除索引行，或恢复 archive。

---

### P1 — 实现时很容易踩坑

#### 4.4 Claim 变更 vs 既有 Outline / Draft

`FR-AI-02`：换主张要提示结构 / 草稿可能受影响。  
技术文档有 `STALE_AI_SUGGESTION`、Idea `revision`，但缺少**产品级状态机**：

- 确认新 Claim 后：旧 outline / draft 是否标 stale？是否禁止 regenerate 静默覆盖？  
- `confirmed_claim` 只存文本，证据链靠 `claim_source_generation_id`——需保证 accept claim 时**事务内**写 claim + generation resolution + revision。

建议在技术方案的数据变化规则或 service 规则中补一张表：事件 × 对 claim / outline / draft / questions 的影响。

#### 4.5 删除语义未完全闭合

| 场景 | 需求 | 技术 | 缺口 |
| --- | --- | --- | --- |
| 删 Idea 且有 Draft | 阻止或让用户处理 Draft | `drafts.idea_id` **restrict** | `deleteIdea` 未定义：先删 Draft？仅报 `DELETE_RESTRICTED`？ |
| 删 Fragment | 提示影响范围 | `previewDeleteFragment` | 好；cascade 会拆掉 `idea_fragments`，**不会**自动失效 claim / outline——需 UI stale 提示（需求有，实现 checklist 应显式） |
| 删 Idea | 不删 Fragment | cascade 只在 junction | 正确 |

#### 4.6 需求 Slice vs 技术 Slice 不对齐

| 能力 | 需求文档 | 技术方案 |
| --- | --- | --- |
| 选区 AI（组织 / 补写 / 润色 / 反馈） | 需求 Slice 3 | 技术 Slice 4 |
| 真实文章验证 | 需求 Slice 4 | 技术 Slice 5 |
| 框架 / 登录探针 | 未单独写 | 技术 Slice 0 |

技术拆分更合理。建议在 `ALPHA_REQUIREMENTS` 实施顺序处注明：**实施切片以 `ALPHA_TECHNICAL_PLAN` 为准**，避免排期双源。

#### 4.7 Application Service 落盘位置不清晰

架构图有 Application Services，目录约定只有：

- `features/*`（functions / queries / components）  
- `modules/*`（领域）  
- `server/*`（db / ai / auth）

未写清 `*.service.ts` 放 `modules/` 还是 `server/`。建议固定为：

```text
modules/<domain>/<domain>.service.ts   # 框架无关
features/<domain>/*.functions.ts       # 仅校验 + 调 service
```

否则 Slice 1 容易把逻辑堆进 functions。

#### 4.8 索引与查询路径偏瘦

已写：`fragments.created_at desc`。  
单用户暂可撑，但 Inbox「未归属」筛选、Workspace 反查会扫 junction。建议至少：

- `idea_fragments(fragment_id)`  
- `ai_generations(idea_id, started_at desc)` 或 `(draft_id, …)`  
- `idea_questions(idea_id)`（若常用未忽略列表，可考虑 partial index）

#### 4.9 并发 AI / 多 tab generation

- 同一 Idea 连点「生成主张」→ 多个 `pending` generation？  
- 旧成功结果 vs 新成功结果谁展示？`superseded` 何时写？  

文档有 `resolution: superseded`，缺**触发规则**。建议：

- 同 `(idea_id|draft_id, operation)` 仅允许一个 `execution_status=pending`  
- 新请求前 cancel 或拒绝已有 pending  
- 仅 `resolution=pending` 的成功结果可被更新的成功结果 supersede  
- 已 `accepted` 不动，由用户显式「重新生成并替换」

#### 4.10 模型名可验证性

基线写 `gpt-5.6-terra` / `gpt-5.6-sol`。Slice 0 应把「模型 ID 是否在目标账号可用、structured output / streaming / abort 是否支持」列为硬探针；`.env.example` 使用真实可跑通的 ID，避免 lock 到不可用模型字符串。

---

### P2 — 一致性与可维护性

#### 4.11 术语跨文档仍有分叉

| 概念 | PRODUCT_SPEC | ALPHA |
| --- | --- | --- |
| 思想容器 | Thread | Idea |
| 主张 | Claim（一级概念） | 多为 Idea 上的 confirmedClaim / 内部能力 |
| 合并 / 拆分 Thread | MVP 有 | Alpha 明确不做 |
| Source Link | 核心概念 | 最小区分 + PA-04 |

Alpha 简化合理，但 `PRODUCT_SPEC` 仍写「关联的 Thread」、Phase 1 合并拆分，读者易以为 Alpha 要做。建议在 SPEC 核心概念处加框说明 Alpha 收敛范围。

#### 4.12 开放决策未闭环回写

需求 §15 开放项 vs 技术 §17 默认值：

| 开放项 | 技术已定 |
| --- | --- | --- |
| Idea:Draft 基数 | 一对一 |
| Markdown 编辑器 | CodeMirror 6 |
| 模型提供商 | OpenAI |
| 未提交恢复 | localStorage recovery |
| 托管 / 认证 | Slice 0 探针 |

建议在需求中把已定项标成「已决 → 见 TECHNICAL_PLAN」，只留仍开放的（如 suggestion UI：diff / 并排 / 卡片）。

#### 4.13 产品 SPEC 的「MVP 可选发布」vs Alpha「明确不做发布」

一致（Alpha 更窄），但 SPEC 仍像 MVP 范围内可选。可注明「不早于 Alpha 后 + 导出稳定」。

#### 4.14 安全细节可再钉死

已有：会话 Cookie、同源、无宽 CORS、密钥不进 DB。可补：

- 登录失败限流的数量级（如 5/min/IP）  
- `APP_ORIGIN` 与 CSRF / 同源校验关系  
- 单用户凭证形态（环境变量账号哈希 / magic link / 固定密码）——Slice 0 选一个并写进 plan 或 ADR  

#### 4.15 `position` on `idea_fragments`

可空 `position`：Workspace 排序是否支持？需求未强制「素材排序」，但有「调整」字样。若 Alpha 不做拖拽排序，写明「position 预留，UI 按 created_at」；若要做，Slice 1 应含 reorder API。

#### 4.16 Draft `title` vs Outline `title`

两处标题，导出 / 预览以谁为准？建议：**Draft.title 为权威**；生成 outline 时的 title 仅作建议，创建 / 保存 Draft 时写入 title。

#### 4.17 NFR 性能无可量化门槛

「不应有明显等待」适合产品阶段；技术上可为 Slice 5 加 soft target（如首页 p95、saveDraft 延迟排除网络），避免后期空对空争论。

---

## 5. 需求覆盖核对（技术 ↔ FR）

| 需求簇 | 覆盖 | 备注 |
| --- | --- | --- |
| FR-AUTH-01 | ✅ Slice 0 | 实现选型仍开放 |
| FR-CAP-01~05 | ✅ Slice 1 | 移动 + localStorage 恢复有 |
| FR-IDEA-01~04 | ✅ Slice 1 | 删 Idea+Draft 策略需补文案 |
| FR-AI-01~05 | ✅ Slice 2 | schema 示例好；claim 变更副作用需补 |
| FR-OUT-01~03 | ⚠️ Slice 3 | **持久化时点**见 §4.1 |
| FR-DRAFT-01~05 | ✅ Slice 3/4 | 选区 stale 设计好 |
| FR-EXP-01~02 | ✅ Slice 1 | YAML 安全到位 |
| AC-09 真文章 | ✅ Slice 5 | 与产品成功标准对齐 |
| 来源追踪 | ✅ 刻意最小 | 与 PA-04 边界清楚 |
| Thread 合并 / AI 归属 | ✅ 不做 | 进 backlog |

未发现「需求要求做、技术完全漏掉」的整块功能；主要风险是 **Outline 状态机** 和 **删除 / 换主张的级联策略** 写得不够可执行。

---

## 6. 架构判断（简评）

```text
Browser → TanStack Start → Services → (Repos | AI Orchestrator → Provider)
                              └→ PostgreSQL
```

对 Alpha（单用户、托管 Web、强 AI 边界）是匹配的：

| 决策 | 判断 |
| --- | --- |
| 单体 TanStack Start | 合理；锁定版本 + Slice 0 探针正确 |
| PostgreSQL 而非 local-only | 符合多设备同一数据 |
| 无向量 / 无 queue | Alpha 正确；上下文超限让用户选也符合原则 |
| CodeMirror 源码编辑 | 符合「Markdown 为唯一格式」；inplace 编辑进 PA-01 正确 |
| MockAiProvider + 真模型 eval 分离 | 保证 CI 稳定且质量可迭代 |

主要技术风险不在选型，而在：**编辑器 + autosave + AI accept 的竞态**（文档已重视）以及 **Start 生态 churn**（已有应对）。

---

## 7. 建议的后续落地清单

按优先级回写基线文档时，建议顺序：

1. **（P0）** 在技术方案写清 Outline 持久化策略（推荐：选结构即建 Draft）。  
2. **（P0）** 修正 `dismissed_at` / `completed_at` 类型为 `timestamptz`。  
3. **（P0）** 修 README archive 死链。  
4. **（P1）** 补「Claim / Fragment 变更 → Outline / Draft / Questions stale」规则表。  
5. **（P1）** 明确 `deleteIdea` 在存在 Draft 时的 API 行为与错误码。  
6. **（P1）** 固定 service 文件位置；补 generation 并发 / supersede 规则。  
7. **（P1）** 需求实施顺序 / 开放决策与技术 Slice、已决默认值对齐。  
8. **（P2）** PRODUCT_SPEC 标注 Alpha 概念收敛；补索引与 title 权威来源。  
9. **（P2）** Slice 0 产出「认证方案 + 托管平台 + 真实 model id」短 ADR，链回 TECHNICAL_PLAN。

---

## 8. 维护说明

- 本文是**评审快照**，不随实现自动更新。  
- 某条意见被采纳并回写基线后，可在对应条目下标注「已落地 → 见某文档 §x」。  
- 新的设计争议优先更新基线需求 / 技术方案；必要时再追加本文件修订记录。
