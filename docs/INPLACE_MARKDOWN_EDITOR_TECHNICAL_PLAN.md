# 成章：轻量 Inplace Markdown 编辑器技术方案

> 文档状态：技术方案初稿 + **Review 决议（§18）**
> 版本：0.1.1
> 更新日期：2026-08-12
> 对应候选需求：[POST_ALPHA_BACKLOG.md：PA-01](./POST_ALPHA_BACKLOG.md#4-pa-01轻量-inplace-markdown-编辑)
> 当前技术基线：[ALPHA_TECHNICAL_PLAN.md](./ALPHA_TECHNICAL_PLAN.md)
> 实施以 §1–§17 为准，**冲突时以 §18 Review 决议为准**

## 1. 方案摘要

在现有 CodeMirror 6 Markdown 源码编辑器上增加一层可切换的 Inplace 视觉呈现：标题、强调、引用、列表和链接在非活动区域接近最终文章排版，光标进入当前块时恢复可编辑的 Markdown 标记。

本方案坚持以下核心约束：

1. Markdown 字符串仍是草稿正文的唯一真相来源；
2. Inplace 与源码模式共享同一个 CodeMirror 文档状态；
3. 模式切换不得修改、解析后重写或规范化 Markdown；
4. 数据库、导出、自动保存和 AI 服务不感知编辑器显示模式；
5. 桌面端提供完整 Inplace，移动端根据平台能力渐进增强；
6. 编辑稳定性、内容完整性和中文输入可靠性优先于视觉效果。

推荐的最终形态不是完整复制 Typora，而是面向成章写作流程的轻量阅读编辑模式，并始终保留完整源码模式作为可靠回退。

## 2. 背景与现状

当前草稿编辑链路如下：

```text
CodeMirror 源码编辑
        |
        v
Markdown 字符串
   +----+-------------+
   |    |             |
   v    v             v
自动保存  选区 AI      Markdown 导出
   |    |
   v    v
PostgreSQL drafts.content
```

现有实现已经形成以下架构约束：

- `src/server/db/schema.ts` 中的 `drafts.content` 直接保存 Markdown 文本；
- `src/components/editor/MarkdownEditor.tsx` 使用 CodeMirror 6 编辑源码；
- `src/components/editor/MarkdownPreview.tsx` 使用 `react-markdown` 与 `remark-gfm` 渲染预览；
- `src/routes/drafts.$draftId.tsx` 使用 revision 实现自动保存和冲突处理；
- `src/modules/generations/generations.service.ts` 的选区 AI 依赖 Markdown 原文的 `from`、`to` 与 hash；
- `src/modules/export/markdown.service.ts` 直接将正文拼接为可移植 Markdown 文档。

这些约束意味着，若改用以富文本 JSON 为真源的 Tiptap、ProseMirror 或其他编辑器，需要额外解决 Markdown 往返转换、原始格式保留和 AI 坐标映射问题。当前阶段不应承担这类迁移成本。

## 3. 目标与非目标

### 3.1 目标

- 提供 `inplace` 和 `source` 两种编辑模式；
- 标题、段落、强调、引用、列表、链接和行内代码获得文章化视觉；
- 非活动区域可隐藏有限的 Markdown 定界符；
- 光标进入当前内容块时显示对应原始 Markdown；
- 模式切换保持正文、选区、滚动位置和撤销历史；
- 保持现有自动保存、revision conflict、选区 AI 和 Markdown 导出协议；
- 在中文输入法、触屏选区和软键盘场景下提供明确降级策略；
- 不支持的 Markdown 结构自动退回源码显示。

### 3.2 非目标

- 完整复刻 Typora；
- 引入富文本 JSON 或 HTML 作为持久化格式；
- 可视化表格编辑；
- 图片上传、对象存储或资源管理；
- Block 拖拽、斜杠命令和复杂浮动工具栏；
- 实时协同、CRDT 或完整版本历史；
- 支持任意 Markdown 方言的无损可视化。

## 4. 关键技术决策

### 4.1 继续使用 CodeMirror 6

Inplace 能力作为 CodeMirror extension 实现，不替换现有编辑器内核。

主要使用：

- Markdown syntax tree：识别块级和行内 Markdown 节点；
- `Decoration.mark`：为正文添加标题、强调、引用、链接和代码样式；
- `Decoration.line`：设置块级行的排版属性；
- `Decoration.replace`：仅隐藏经过验证的短 Markdown 定界符；
- `ViewPlugin`：根据文档、选区、可视区域和 composition 状态维护 decorations；
- `Compartment`：动态切换 Inplace 和源码扩展；
- Transaction：处理用户输入、AI 替换、外部内容同步和撤销。

不得直接修改 CodeMirror 管理的内容 DOM。

### 4.2 Markdown 保持唯一真源

显示层只创建 decorations，不创建第二份可编辑文档树。任意时刻均应满足：

```ts
persistedContent === editorView.state.doc.toString()
```

以下操作不得触发 Markdown parse/serialize：

- 切换编辑模式；
- 光标进入或离开内容块；
- decoration 更新；
- 展开或隐藏定界符；
- 响应式布局切换。

### 4.3 平台渐进增强

不同平台使用不同默认能力：

| 平台                   | 默认模式     | 默认能力                                            |
| ---------------------- | ------------ | --------------------------------------------------- |
| 桌面 Chromium / Safari | Inplace      | 文章化排版并隐藏已验证的非活动定界符                |
| Android Chrome         | 简化 Inplace | 文章化排版；定界符隐藏按真机结果逐项开放            |
| iOS Safari             | 增强源码     | 文章化排版和语法高亮，不使用 replacement decoration |
| 所有平台               | 完整源码     | 始终可手动切换的可靠回退                            |

平台默认值只是能力策略，不改变正文格式。用户选择可保存到 localStorage，但不进入 Draft 数据。

不以 UA 字符串作为唯一判断依据。实现时应组合：

- 粗粒度平台判断；
- 触摸和指针能力；
- 已验证的功能开关；
- 用户手动选择。

## 5. 编辑器内部架构

### 5.1 Editor Adapter

扩展现有 `MarkdownEditor` 薄适配层，页面不直接持有或操作 CodeMirror 类型。

建议接口：

```ts
type EditorMode = 'inplace' | 'source'

type TextChange = {
  from: number
  to: number
  insert: string
}

type MarkdownEditorHandle = {
  getContent(): string
  getSelection(): EditorSelection | null
  replaceRange(change: TextChange, options?: TransactionOptions): void
  replaceDocument(content: string, options?: TransactionOptions): void
  setMode(mode: EditorMode): void
  focus(): void
  undo(): void
  redo(): void
}
```

Adapter 负责：

- 将 CodeMirror transaction 转换为页面可消费的变更事件；
- 暴露稳定的 Markdown 字符选区；
- 区分用户输入、AI 应用、服务端同步和模式重配置；
- 保证外部内容变化通过显式 transaction 应用；
- 保证 AI 替换作为一次 undo 单元。

### 5.2 Inplace Extension

建议拆分为以下内部模块：

```text
src/components/editor/
  MarkdownEditor.tsx
  editor-types.ts
  inplace/
    extension.ts
    decorations.ts
    active-block.ts
    platform-policy.ts
    theme.ts
```

职责边界：

- `extension.ts`：组装 state field、view plugin、theme 和 compartment；
- `decorations.ts`：从 syntax tree 生成 decoration ranges；
- `active-block.ts`：根据选区确定当前活动块；
- `platform-policy.ts`：决定允许启用的显示能力；
- `theme.ts`：编辑器文章化视觉样式。

以上是建议结构，实施时可根据扩展规模合并文件，但不应将语法遍历全部堆回 React 组件。

### 5.3 Draft Editing Controller

草稿页或专用 hook 维护：

```text
serverContent     最近一次服务端确认的正文
workingContent    编辑器当前正文
baseRevision      当前保存基准
saveState         idle / dirty / saving / saved / failed / conflict
recoveryDraft     本地未确认副本
```

CodeMirror EditorState 是客户端工作正文的即时真源。React 保存内容快照和页面状态，但不应在每次按键后将同一个 `value` 重新灌回编辑器。

## 6. Inplace 显示规则

### 6.1 活动块定义

活动块是主选区所在的最小块级 Markdown 节点，例如：

- Paragraph；
- ATXHeading；
- Blockquote；
- ListItem；
- FencedCode；
- HTMLBlock。

规则：

1. 光标为空时，以光标所在块为活动块；
2. 选区跨越多个块时，所有相交块都按源码显示；
3. composition 期间，composition 所在块始终按源码显示；
4. 无法可靠解析的位置按当前整行源码显示；
5. 复杂嵌套结构宁可多显示标记，不隐藏可能影响编辑的字符。

### 6.2 第一版语法范围

| 语法        | 非活动状态                   | 活动状态           |
| ----------- | ---------------------------- | ------------------ |
| 标题        | 隐藏 `#`，应用标题字号与留白 | 显示完整源码       |
| 粗体 / 斜体 | 隐藏定界符，应用字形         | 显示定界符         |
| 引用        | 弱化或隐藏 `>`，显示引用样式 | 显示完整源码       |
| 无序列表    | 显示自然项目符号和缩进       | 显示 Markdown 标记 |
| 有序列表    | 保留序号并改善缩进           | 显示完整源码       |
| 链接        | 显示标签，弱化或隐藏 URL     | 显示完整链接语法   |
| 行内代码    | 隐藏反引号，显示代码样式     | 显示反引号         |
| 代码块      | 接近源码显示                 | 完整源码           |
| 表格 / HTML | 源码显示                     | 源码显示           |

第一阶段只使用 `mark` 和 `line` decoration 改善视觉，不隐藏字符。`replace` 必须按语法逐项启用，并通过桌面与移动真机测试。

### 6.3 模式切换

通过 CodeMirror `Compartment` 启用或移除 Inplace extension。切换时必须保证：

- `doc.toString()` 逐字符不变；
- 当前 selection 不变；
- scroll position 尽量不变；
- undo history 不重置；
- 不触发 dirty 和自动保存；
- 不重新创建 EditorView。

## 7. 自动保存与恢复

在实现 Inplace 前，应先加固现有保存状态机。

当前草稿页保存成功后会把服务端返回的正文重新写入 React state；如果保存期间用户继续输入，旧响应可能覆盖较新的本地工作副本。目标保存流程为：

1. 用户 transaction 修改文档；
2. 同步更新 `workingContentRef`；
3. 立即写 localStorage recovery；
4. 标记 `dirty`；
5. debounce 后提交本次保存快照；
6. 保存成功只确认对应快照及其 revision；
7. 若当前工作正文已更新，不把旧响应正文写回编辑器；
8. 继续提交最新快照；
9. 仅当服务端已确认正文等于当前工作正文时清理 recovery。

Recovery 至少包含：

```ts
type DraftRecovery = {
  draftId: string
  baseRevision: number
  title: string
  content: string
  savedAt: string
}
```

页面加载时若发现 recovery 与服务端内容不同，应允许用户恢复、复制或丢弃，而不是静默覆盖任意一侧。

## 8. AI 选区集成

Decorations 不改变 Markdown 文档位置，因此保留现有 AI 协议：

```text
selectionFrom
selectionTo
selectedText
selectionHash
draftRevision
```

应用 AI 改写时：

1. 服务端继续验证 revision、选区文本和 hash；
2. 服务端返回更新后正文与 `appliedFrom`、`appliedTo`；
3. 客户端通过一次 CodeMirror transaction 替换原选区；
4. transaction 加入 undo history；
5. 客户端更新已确认 revision 和 server snapshot；
6. 光标移动到替换结果末尾，或选中替换后的文本；
7. Inplace decorations 根据新 syntax tree 自动刷新。

不得通过重建 EditorView 或重新设置整篇受控 `value` 来应用 AI 建议。

### 8.1 移动端选区 AI

移动端不在文字旁显示悬浮菜单，建议流程：

1. 用户使用系统长按和拖动手柄选择文字；
2. 编辑器缓存逻辑选区；
3. 页面底部操作栏出现“组织、补写、润色、反馈”；
4. 点击后打开 bottom sheet；
5. 即使编辑器暂时失焦，也保留逻辑选区；
6. 用户接受结果后以单次 transaction 替换。

不得拦截系统长按、双击、复制和粘贴菜单。

## 9. 移动端布局与交互

### 9.1 页面布局

当前桌面端的源码与预览并排布局不适用于手机。移动端应采用：

- 单栏编辑；
- 编辑、预览以模式或页签切换，不持续上下并列；
- 编辑区域使用基于 `dvh` 的最小高度，适应软键盘；
- 页面只保留一个主要垂直滚动容器；
- 避免固定 `480px` 高度和嵌套滚动；
- 保存状态保留在紧凑顶栏；
- 次要操作收入菜单；
- 触控目标不小于约 44px。

### 9.2 输入法安全

Composition 期间：

- 不更新 replacement decorations；
- 不隐藏新产生的 Markdown 标记；
- composition 所在块保持源码显示；
- 不拦截浏览器默认输入事件；
- 不触发模式自动切换；
- composition 结束并待 DOM 输入稳定后，再刷新可视区域 decorations。

必须覆盖中文拼音、联想输入、自动纠错和中英文混排。

### 9.3 移动端第一版限制

正文内部暂不加入：

- 自定义可点击 checkbox；
- 链接悬浮按钮；
- 浮动格式工具条；
- Block 拖拽手柄；
- 原子化 Markdown widget。

这些交互容易与触屏选区、系统上下文菜单和软键盘竞争事件。

## 10. 性能策略

- 只遍历 CodeMirror `visibleRanges` 及必要上下文；
- 仅在 doc、viewport、selection、syntax tree 或 composition 状态变化时更新；
- 优先增量映射 decorations，无法安全映射时再重算可视区域；
- 不在每次按键后 parse 和渲染完整 Markdown preview；
- Inplace 模式下默认收起独立预览；
- 不使用大量跨行 replacement decorations；
- 对长文档分别记录输入延迟、selection 更新和 decoration 重算耗时。

建议基线测试文档：

- 5 千字普通中文文章；
- 2 万字长文；
- 包含大量列表、引用和行内强调的压力样本。

## 11. 无障碍要求

- 源码模式始终可通过键盘切换；
- 模式按钮使用明确文本和 `aria-pressed`；
- 不只用颜色表示活动块、保存状态或错误；
- decoration 不能改变屏幕阅读器读取到的 Markdown 文本；
- 隐藏定界符不应制造无法到达的光标位置；
- `prefers-reduced-motion` 下不使用布局过渡动画；
- 移动端底部面板具备正确焦点管理和关闭返回路径。

## 12. 测试方案

### 12.1 单元测试

- 活动块识别；
- 支持节点的 decoration 生成；
- 跨块选区回退；
- 不支持语法回退源码；
- decoration range 不越界；
- 平台策略输出；
- 模式切换前后正文逐字符一致。

### 12.2 编辑器集成测试

- 标题、强调、列表边界的回车与删除；
- 中文 composition；
- 跨 Markdown 节点选择；
- 模式切换保留 selection 和 undo history；
- AI 替换可一次 undo；
- 外部服务端确认不覆盖更新的本地输入；
- recovery 写入、恢复和清理。

### 12.3 E2E 测试

- 输入、自动保存、刷新恢复；
- 保存期间继续输入；
- 多标签页 revision conflict；
- 选区 AI、接受、撤销、重新保存；
- Inplace/source 往返后导出内容逐字符一致；
- 编辑与预览模式切换；
- Chromium、Safari 与移动浏览器核心路径。

### 12.4 真机测试矩阵

至少覆盖：

| 平台                    | 场景                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| iOS Safari              | 中文输入、长按选区、拖动手柄、复制粘贴、自动纠错、软键盘高度变化 |
| Android Chrome + Gboard | 中文输入、Backspace、Enter、长按选区、粘贴、键盘收起与恢复       |
| 桌面 Safari             | 中文 composition、跨行选区、undo/redo                            |
| 桌面 Chromium           | 完整功能、长文性能、AI 替换                                      |

## 13. 分阶段实施

### Phase 0：稳定编辑基础

- 重构 Editor Adapter；
- 明确 CodeMirror EditorState 与 React state 的职责；
- 修复自动保存期间继续输入的覆盖风险；
- 实现 Draft localStorage recovery；
- 暴露 selection、transaction、focus、undo 和 redo；
- 接通并验证现有选区 AI。

完成标准：不开启 Inplace 时，源码编辑、保存、恢复和 AI 修改已经可靠。

### Phase 1：文章化源码模式

- 使用 `mark` 和 `line` decorations 改善标题、引用、列表、强调和代码视觉；
- 移除行号等不适合写作的默认代码编辑器视觉；
- 完成移动端单栏布局和编辑/预览切换；
- 暂不隐藏任何 Markdown 字符。

完成标准：所有目标平台都能获得更接近文章的编辑体验，正文和输入行为不变。

### Phase 2：桌面轻量 Inplace

- 识别活动块；
- 隐藏非活动块内经过验证的短定界符；
- 加入 Inplace/source 模式切换；
- 逐项支持标题、强调、引用、链接和行内代码；
- 完成桌面浏览器回归测试。

完成标准：桌面端能够自然阅读和编辑，模式切换不改变正文或历史。

### Phase 3：移动端渐进开放

- Android Chrome 按语法逐项开放 replacement decoration；
- iOS Safari 默认保持增强源码，除非真机测试证明特定语法安全；
- 完成移动端底部 AI 操作区；
- 根据真实设备遥测和反馈调整平台策略。

完成标准：移动端没有因追求隐藏语法而降低输入、选区和恢复可靠性。

## 14. 验收标准

### 14.1 通用验收

- 两种模式使用同一份 Markdown 文本；
- 往返切换 100 次后内容逐字符一致；
- 标题、强调、引用和列表能够自然阅读及编辑；
- 光标进入相关块时能够控制原始 Markdown；
- AI 选区坐标不受显示模式影响；
- AI 替换可以一次撤销；
- 自动保存期间继续输入不会丢失内容；
- 刷新可以恢复最近服务端版本或未确认 recovery；
- 导出结果与源码模式正文一致；
- 不支持的结构能安全退回源码。

### 14.2 移动端开放完整 Inplace 的门槛

某个平台只有全部通过以下场景，才允许默认启用定界符隐藏：

- 中文连续输入没有丢字、重复或错位；
- 拼音候选确认后光标位置正确；
- Backspace 和 Delete 不会异常关闭软键盘；
- 长按选择及拖动手柄正常；
- 跨 Markdown 块选择不跳动；
- 自动纠错、复制和粘贴正常；
- decoration 更新不导致页面滚动；
- 切换模式不丢失选区或未确认输入；
- AI 替换后可以一次撤销；
- 对应平台真机回归测试通过。

未达到门槛时，保持增强源码模式，不视为功能失败。

## 15. 风险与应对

### 15.1 Replacement decoration 影响光标与选区

应对：第一版只隐藏短定界符；复杂结构和移动端默认回退源码；逐语法功能开关。

### 15.2 输入过程中的 Markdown 语法树暂时不完整

应对：活动块、跨块选区和 composition 区域显示源码；解析不确定时不隐藏字符。

### 15.3 React 受控值与 CodeMirror transaction 冲突

应对：EditorState 持有即时工作正文；外部修改走显式 transaction，不通过重建编辑器同步。

### 15.4 保存响应覆盖较新的本地输入

应对：保存请求绑定内容快照；响应只确认对应快照和 revision，不盲目回写正文。

### 15.5 移动浏览器行为不一致

应对：平台策略、真机矩阵、源码回退和逐项启用；不以桌面模拟器代替真机验收。

### 15.6 功能范围膨胀

应对：坚持“基础写作语法 Inplace，复杂结构源码编辑”；图片、表格和 Block 编辑另立需求。

## 16. 待评审决策

实施前需要确认：

1. PA-01 是否已达到进入开发的产品信号，而不只是技术上可行；
2. 桌面端默认启用 Inplace，还是先由用户手动开启；
3. 第一版链接是否隐藏 URL，或只做视觉弱化；
4. recovery 冲突采用内联提示、对话框还是独立恢复页；
5. 是否将移动端文章化源码模式纳入 Phase 1 的发布门槛；
6. 真机测试所覆盖的最低 iOS、Android 和输入法版本。

在这些决策完成前，可以推进 Phase 0 的保存与编辑器基础加固，因为它们独立于 Inplace 的最终产品开关。

## 17. 参考资料

- [CodeMirror 6 Decorations](https://codemirror.net/examples/decoration/)
- [CodeMirror 6 Reference Manual](https://codemirror.net/docs/ref/)
- [CodeMirror 6 Changelog](https://codemirror.net/docs/changelog/)
- [成章 Alpha 技术方案](./ALPHA_TECHNICAL_PLAN.md)
- [成章 Alpha 后需求池](./POST_ALPHA_BACKLOG.md)
- 社区参考（**仅作实现参考，不引入为依赖**）：[anasyd/react-inline-markdown-editor](https://github.com/anasyd/react-inline-markdown-editor) — CodeMirror 6 decoration 隐藏定界符的思路

## 18. Review 决议

> 状态：已评审（内部 review）  
> 日期：2026-08-12  
> 结论：**架构方向批准**；按下方决议收紧默认策略与分期，再进入实施。

### 18.1 总评

| 项 | 决议 |
| --- | --- |
| 内核 | **继续 CodeMirror 6**，Inplace 仅用 decorations / compartment；**不**换 Tiptap / ProseMirror JSON 真源 |
| 真源 | **`drafts.content` Markdown 字符串唯一真源**；模式切换与显隐标记不得 parse/serialize 重写正文 |
| 选区 AI | **协议保持字符偏移**（`from` / `to` / text / hash）；显示模式不得改变文档坐标 |
| 第三方库 | **不**将小众 npm 编辑器接入生产依赖；decoration 实现可参考社区项目后自研进仓库 |
| 文档角色 | 本文作为 PA-01 工程准绳；**Phase 0 可立即推进**，Phase 2+ 绑定产品信号与真机门槛 |

### 18.2 对 §16 待评审决策的拍板

| # | 议题 | 决议 |
| --- | --- | --- |
| 1 | 是否进入 PA-01 开发 | **先做 Phase 0**（adapter、保存竞态、recovery、选区 AI 接通）。Phase 2 桌面藏定界符须满足 PA-01 评估信号（真文写作中 MD 源码已成为显著阻力），不单因「技术可行」就默认上线 Inplace |
| 2 | 桌面默认模式 | **第一版默认「增强源码 / 文章化」或由用户手动开 Inplace**；短定界符隐藏稳定并通过桌面回归后，再考虑默认 Inplace |
| 3 | 链接 URL | **v1 只做视觉弱化，不使用 replace 隐藏 URL**；降低编辑链接时的选区与光标风险 |
| 4 | recovery 冲突 UI | **内联 callout**（恢复 / 复制本地 / 丢弃），与现有 stale、revision conflict 模式一致；不做独立恢复页 |
| 5 | 移动端是否 Phase 1 发布门槛 | **单栏编辑布局为 Phase 1 门槛**；移动端文章化 decoration 尽力而为，**不阻塞**桌面 Phase 1 发布 |
| 6 | 真机最低覆盖 | 发布「藏定界符」能力前至少：**近期 iOS Safari + 一种中文输入法**、**Android Chrome + Gboard**；桌面 Chromium / Safari 各一条核心路径。版本号随发布清单更新，不在本文写死 |

### 18.3 实施补充约定（相对正文的收紧）

以下约定补充 §5–§8，实施时视为有效需求：

1. **活动块与行内显标（补 §6.1）**  
   - 块级定界符（`#`、`>`、list mark 等）：以**活动块**为准显示/隐藏。  
   - 行内定界符（`**`、`` ` ``、链接语法等）：以光标落入的**行内节点（或所在行）**为准，避免长段落整段冒标记。  
   - 跨块选区、composition、解析不确定：整段相关范围保持源码显示。

2. **Replacement decoration（补 §6.2 / §10）**  
   - 优先 `Decoration.replace({})` 折叠短定界符，避免 `display:none` widget 破坏 hit-testing。  
   - 列表 bullet widget、图片 widget 属 **Phase 2+ 且桌面优先**，不与「短定界符 HIDE」同一验收包强绑。

3. **保存幂等（补 §7）**  
   - 每次保存请求绑定快照标识（如 content hash + `baseRevision`，或 `clientSaveId`）。  
   - 响应与当前工作正文不匹配时：**禁止**把响应正文写回编辑器。  
   - recovery key 按 `draftId`；多标签冲突用内联提示，不静默覆盖。

4. **选区 AI 逻辑选区（补 §8.1）**  
   - 逻辑选区保存在 **Editor Adapter**，不单靠可能失焦过期的 React state。  
   - 打开 AI 面板至接受期间若文档变更：接受前**重校验 selectionHash**，失败则清空选区并提示。  
   - 若需服务端 `appliedFrom` / `appliedTo`：与现 API 核对；缺失则单独立项扩展协议，不在实现中假设已有。

5. **预览与 Inplace 关系（补 §9）**  
   - Inplace（或文章化主编辑）开启时：**不**再并排常驻预览；预览降为可选「导出前核对」。  
   - 完整源码模式可保留预览（含移动端页签）。  
   - 避免 Inplace / Source / Preview 三套主界面同时抢焦点。

6. **能力开关模型（补 §4.3）**  
   实现时使用显式 capability（示例），而非散落的 UA 分支：

   ```ts
   type InplaceCapability = {
     articleChrome: boolean // mark / line 文章化
     hideDelimiters: boolean // replace 藏定界符
     bulletWidget: boolean
     imageWidget: boolean
   }
   ```

   平台默认表 + 用户 localStorage 覆盖 + 强制 source 回退。

7. **测试执行比例（补 §12）**  
   - **合并 / Phase 0–1 必过**：保存竞态、recovery、模式切换正文逐字符一致、AI 替换一次 undo（自动化优先）。  
   - **完整真机矩阵**：作为「默认开启 hideDelimiters」的发布门槛，不阻塞 Phase 0 合并。

### 18.4 分期执行决议

| Phase | 决议 |
| --- | --- |
| **0** | **批准立即做**。Adapter、EditorState 与 React 职责、保存不覆盖、recovery、选区 AI 接通。不开启 Inplace 也必须可靠。 |
| **1** | **批准**。`mark`/`line` 文章化 + 桌面可用的单栏写作布局；移动单栏为门槛；**不**隐藏定界符。 |
| **2** | **有条件批准**。桌面短定界符隐藏 + Inplace/source 切换；默认不强制 Inplace（见 §18.2-2）；依赖 PA-01 产品信号与桌面回归。 |
| **3** | **保守**。移动端 replace 严格按 §14.2；未达标保持增强源码，不视为项目失败。 |

### 18.5 明确不做（本方案周期内）

- 富文本 JSON / HTML 作为持久化真源；  
- 依赖社区过小的第三方 Inplace 编辑器包；  
- 可视化表格、图床/资源库、Block 拖拽、斜杠命令、实时协同；  
- 为视觉效果牺牲中文 composition 或系统选区手势。

### 18.6 后续文档动作

- 实施 Phase 0 前：核对选区 AI 现网/代码协议字段，必要时更新 §8。  
- Phase 2 开工前：用 capability 表与 §14.2 填一版「桌面 hideDelimiters 发布检查清单」。  
- 产品侧：PA-01 信号未出现时，只交付 Phase 0（及可选 Phase 1 文章化），不默认推广 Inplace。
