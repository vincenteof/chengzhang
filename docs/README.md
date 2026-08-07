# 成章产品文档

本目录存放产品定义、版本需求和后续设计文档。

## 当前文档

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| [产品定义与 MVP 计划](./PRODUCT_SPEC.md) | 讨论稿 | 描述长期产品方向、核心概念、产品原则与阶段规划 |
| [Alpha 详细需求](./ALPHA_REQUIREMENTS.md) | Alpha 基线需求 | 定义首个可运行版本的范围、流程、功能需求、数据要求与验收标准 |
| [Alpha 技术方案与实施计划](./ALPHA_TECHNICAL_PLAN.md) | 技术方案基线 | 定义基于 TanStack Start、PostgreSQL 的托管 Web 架构、数据模型、AI 协议、测试和实施切片 |
| [Alpha 后需求池](./POST_ALPHA_BACKLOG.md) | 候选需求收集 | 收集 Alpha 验收后可能进入产品的需求，不构成当前版本承诺 |

## 阅读顺序

1. 先阅读 `PRODUCT_SPEC.md`，理解成章要解决的问题与长期边界；
2. 再阅读 `ALPHA_REQUIREMENTS.md`，了解首个版本具体需要实现什么；
3. 最后阅读 `ALPHA_TECHNICAL_PLAN.md`，了解 Alpha 如何实现和验证；
4. `POST_ALPHA_BACKLOG.md` 仅用于收集未来候选需求；
5. 实现范围发生冲突时，以 `ALPHA_REQUIREMENTS.md` 对 Alpha 的明确约束为准。

## 文档组织约定

- `PRODUCT_SPEC.md`：产品愿景和跨版本定义；
- `<VERSION>_REQUIREMENTS.md`：指定版本的详细需求与验收标准；
- `<VERSION>_TECHNICAL_PLAN.md`：指定版本的技术方案、风险与实施计划；
- `POST_ALPHA_BACKLOG.md`：尚未进入版本承诺的后续候选需求；
- 后续技术方案、交互设计和决策记录应分别建立独立文档，避免把实现细节混入产品定义。
