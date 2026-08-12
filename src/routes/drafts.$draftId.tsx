import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MarkdownEditor } from '#/components/editor/MarkdownEditor'
import type {
  EditorMode,
  EditorSelection,
  MarkdownEditorHandle,
  SelectionCoords,
} from '#/components/editor/MarkdownEditor'
import { SelectionAiBubble } from '#/components/editor/SelectionAiBubble'
import { MarkdownPreview } from '#/components/editor/MarkdownPreview'
import {
  clearDraftRecovery,
  readDraftRecovery,
  recoveryDiffersFromServer,
  writeDraftRecovery,
} from '#/components/editor/draft-recovery'
import type { DraftRecovery } from '#/components/editor/draft-recovery'
import type { TransactionSource } from '#/components/editor/editor-types'
import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import {
  clearDraftStaleFn,
  getDraftEditorContextFn,
  saveDraftFn,
} from '#/features/drafts/drafts.functions'
import {
  acceptDraftGenerationFn,
  acceptSelectionRewriteFn,
  generateDraftFn,
  rejectGenerationFn,
  runSelectionAiFn,
} from '#/features/generations/generations.functions'
import type {
  SelectionFeedback,
  SelectionRewrite,
} from '#/server/ai/schemas/selection'
import { hashText } from '#/shared/text-hash'

export const Route = createFileRoute('/drafts/$draftId')({
  loader: async ({ params }) => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const ctx = await getDraftEditorContextFn({
      data: { draftId: params.draftId },
    })
    if (!ctx.ok) {
      throw redirect({ to: '/ideas' })
    }
    return { user: session.data.user, context: ctx.data }
  },
  component: DraftEditorPage,
})

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict'

const MODE_STORAGE_KEY = 'chengzhang:editor-mode'

function loadStoredMode(): EditorMode {
  if (typeof localStorage === 'undefined') return 'inplace'
  const v = localStorage.getItem(MODE_STORAGE_KEY)
  return v === 'source' ? 'source' : 'inplace'
}

function DraftEditorPage() {
  const { user, context } = Route.useLoaderData()
  const initial = context.draft
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const saveDraft = useServerFn(saveDraftFn)
  const clearStale = useServerFn(clearDraftStaleFn)
  const generateDraft = useServerFn(generateDraftFn)
  const acceptDraftGen = useServerFn(acceptDraftGenerationFn)
  const rejectGeneration = useServerFn(rejectGenerationFn)
  const runSelectionAi = useServerFn(runSelectionAiFn)
  const acceptSelectionRewrite = useServerFn(acceptSelectionRewriteFn)

  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const titleRef = useRef(initial.title)
  const workingContentRef = useRef(initial.content)
  const revisionRef = useRef(initial.revision)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const pendingSaveRef = useRef(false)
  /** Snapshot identity for in-flight save — ignore stale responses. */
  const inflightSaveRef = useRef<{
    content: string
    title: string
    baseRevision: number
  } | null>(null)

  const [title, setTitle] = useState(initial.title)
  const [, setRevision] = useState(initial.revision)
  const [sourceStaleAt, setSourceStaleAt] = useState(initial.sourceStaleAt)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(loadStoredMode)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState(initial.content)
  const previewCloseRef = useRef<HTMLButtonElement>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [selectionActiveOp, setSelectionActiveOp] = useState<
    'organize' | 'expand' | 'polish' | 'feedback' | null
  >(null)
  const [selectionHint, setSelectionHint] = useState<EditorSelection | null>(
    null,
  )
  const [selectionCoords, setSelectionCoords] =
    useState<SelectionCoords | null>(null)
  /** Debounced: bubble only after selection settles (not on every drag tick). */
  const [selectionSettled, setSelectionSettled] = useState(false)
  /** Keep bubble while typing in instruction if CM clears selection. */
  const pinnedSelectionRef = useRef<EditorSelection | null>(null)
  const pinnedCoordsRef = useRef<SelectionCoords | null>(null)
  const [selectionInstruction, setSelectionInstruction] = useState('')
  const [draftSuggestion, setDraftSuggestion] = useState<{
    generationId: string
    text: string
  } | null>(null)
  const [selectionSuggestion, setSelectionSuggestion] = useState<{
    generationId: string
    operation: 'organize' | 'expand' | 'polish' | 'feedback'
    from: number
    to: number
    hash: string
    originalText: string
    rewrite?: SelectionRewrite
    feedback?: SelectionFeedback
  } | null>(null)
  const [lastAiUndoContent, setLastAiUndoContent] = useState<string | null>(
    null,
  )
  const [conflict, setConflict] = useState<{
    serverRevision: number
    serverContent: string
    serverTitle: string
  } | null>(null)
  const [recoveryPrompt, setRecoveryPrompt] = useState<DraftRecovery | null>(
    null,
  )

  // Load recovery once on mount
  useEffect(() => {
    const recovery = readDraftRecovery(initial.id)
    if (
      recovery &&
      recoveryDiffersFromServer(recovery, {
        title: initial.title,
        content: initial.content,
        revision: initial.revision,
      })
    ) {
      setRecoveryPrompt(recovery)
    }
    // Mount-only recovery check for this draft id
  }, [initial.id])

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    previewCloseRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [previewOpen])

  // Wait until selection is stable before showing the AI bubble
  useEffect(() => {
    const hasText = Boolean(selectionHint?.text.trim())
    if (!hasText) {
      setSelectionSettled(false)
      return
    }
    // Selection changed — hide until settle delay elapses
    setSelectionSettled(false)
    const from = selectionHint!.from
    const to = selectionHint!.to
    const timer = window.setTimeout(() => {
      // Re-check still selected with same range
      const cur = editorRef.current?.getSelection()
      if (cur && cur.from === from && cur.to === to && cur.text.trim()) {
        setSelectionSettled(true)
      }
    }, 380)
    return () => window.clearTimeout(timer)
  }, [selectionHint?.from, selectionHint?.to, selectionHint?.text])

  const bumpRecovery = useCallback(() => {
    writeDraftRecovery({
      draftId: initial.id,
      baseRevision: revisionRef.current,
      title: titleRef.current,
      content: workingContentRef.current,
      savedAt: new Date().toISOString(),
    })
  }, [initial.id])

  const persist = useCallback(async () => {
    if (savingRef.current) {
      pendingSaveRef.current = true
      return
    }
    const snap = {
      content: workingContentRef.current,
      title: titleRef.current,
      baseRevision: revisionRef.current,
    }
    // Always take live editor content if mounted
    const live = editorRef.current?.getContent()
    if (typeof live === 'string') {
      snap.content = live
      workingContentRef.current = live
    }

    savingRef.current = true
    inflightSaveRef.current = snap
    setSaveState('saving')
    try {
      const result = await saveDraft({
        data: {
          id: initial.id,
          baseRevision: snap.baseRevision,
          title: snap.title,
          content: snap.content,
        },
      })
      if (!result.ok) {
        if (result.error.code === 'REVISION_CONFLICT') {
          const details = result.error.details as
            | {
                serverRevision?: number
                serverContent?: string
                serverTitle?: string
              }
            | undefined
          setConflict({
            serverRevision: Number(
              details?.serverRevision ?? snap.baseRevision + 1,
            ),
            serverContent: String(details?.serverContent ?? ''),
            serverTitle: String(details?.serverTitle ?? ''),
          })
          setSaveState('conflict')
          setMessage('检测到其他位置的更新，已停止覆盖')
        } else {
          setSaveState('failed')
          setMessage(result.error.message)
        }
        return
      }

      // Only apply revision/metadata if this response matches still-current work
      // or is a prefix of continuous saves (content still equals what we sent).
      const stillSameContent =
        workingContentRef.current === snap.content &&
        titleRef.current === snap.title

      revisionRef.current = result.data.revision
      setRevision(result.data.revision)
      setSourceStaleAt(result.data.sourceStaleAt)

      if (stillSameContent) {
        dirtyRef.current = false
        setSaveState('saved')
        clearDraftRecovery(initial.id)
      } else {
        // User typed during save — keep dirty and do not clobber editor
        dirtyRef.current = true
        setSaveState('dirty')
        bumpRecovery()
      }
      setConflict(null)
    } catch {
      setSaveState('failed')
      setMessage('保存失败，本地内容仍在')
    } finally {
      savingRef.current = false
      inflightSaveRef.current = null
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        void persist()
      }
    }
  }, [bumpRecovery, initial.id, saveDraft])

  useEffect(() => {
    if (saveState !== 'dirty') return
    const timer = window.setTimeout(() => {
      void persist()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [saveState, title, persist])

  function markTitleDirty(next: string) {
    titleRef.current = next
    setTitle(next)
    dirtyRef.current = true
    setSaveState('dirty')
    bumpRecovery()
  }

  function onEditorContentChange(content: string, source: TransactionSource) {
    workingContentRef.current = content
    setPreviewContent(content)
    // user / recovery: local dirty. ai/server: applied with known revision already.
    if (source === 'user' || source === 'recovery') {
      dirtyRef.current = true
      setSaveState('dirty')
      bumpRecovery()
    }
  }

  function setMode(next: EditorMode) {
    setEditorMode(next)
    editorRef.current?.setMode(next)
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }

  function pinSelectionFromEditor() {
    const sel =
      editorRef.current?.getSelection() ??
      editorRef.current?.getLogicalSelection() ??
      pinnedSelectionRef.current
    const coords =
      editorRef.current?.getSelectionCoords() ??
      selectionCoords ??
      pinnedCoordsRef.current
    if (sel?.text.trim()) {
      pinnedSelectionRef.current = sel
      setSelectionHint(sel)
    }
    if (coords) {
      pinnedCoordsRef.current = coords
      setSelectionCoords(coords)
    }
  }

  async function runSelection(
    operation: 'organize' | 'expand' | 'polish' | 'feedback',
  ) {
    const sel =
      editorRef.current?.getSelection() ??
      editorRef.current?.getLogicalSelection() ??
      pinnedSelectionRef.current
    if (!sel?.text.trim()) {
      setMessage('请先在正文中选中一段文字')
      return
    }
    setSelectionActiveOp(operation)
    setMessage(operation === 'feedback' ? '正在生成反馈…' : '正在生成选区建议…')
    try {
      if (dirtyRef.current) await persist()
      const content =
        editorRef.current?.getContent() ?? workingContentRef.current
      workingContentRef.current = content
      const hash = await hashText(sel.text)
      const before = content.slice(Math.max(0, sel.from - 280), sel.from)
      const after = content.slice(sel.to, sel.to + 280)
      const result = await runSelectionAi({
        data: {
          ideaId: initial.ideaId,
          draftId: initial.id,
          operation,
          draftRevision: revisionRef.current,
          selectionFrom: sel.from,
          selectionTo: sel.to,
          selectedText: sel.text,
          selectionHash: hash,
          contextBefore: before,
          contextAfter: after,
          userInstruction: selectionInstruction || null,
        },
      })
      if (!result.ok) {
        setMessage(`选区 AI 失败：${result.error.message}`)
        return
      }
      if (operation === 'feedback') {
        setSelectionSuggestion({
          generationId: result.data.generation.id,
          operation,
          from: result.data.selectionFrom,
          to: result.data.selectionTo,
          hash: result.data.selectionHash,
          originalText: result.data.originalText,
          feedback: result.data.result as unknown as SelectionFeedback,
        })
        setMessage('反馈已生成（不会改正文）')
      } else {
        setSelectionSuggestion({
          generationId: result.data.generation.id,
          operation,
          from: result.data.selectionFrom,
          to: result.data.selectionTo,
          hash: result.data.selectionHash,
          originalText: result.data.originalText,
          rewrite: result.data.result as unknown as SelectionRewrite,
        })
        setMessage('选区建议已生成，确认后才会替换')
      }
    } catch {
      setMessage('选区 AI 失败：网络或服务器异常')
    } finally {
      setSelectionActiveOp(null)
    }
  }

  const saveLabel =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'saved'
        ? '已保存'
        : saveState === 'dirty'
          ? '未保存'
          : saveState === 'failed'
            ? '保存失败'
            : saveState === 'conflict'
              ? '版本冲突'
              : '就绪'

  async function regenerateFromFragments() {
    setAiBusy(true)
    setMessage('正在根据碎片重新生成…')
    try {
      if (dirtyRef.current) await persist()
      const result = await generateDraft({
        data: {
          ideaId: initial.ideaId,
          draftId: initial.id,
        },
      })
      if (!result.ok) {
        setMessage(`生成失败：${result.error.message}`)
        return
      }
      setDraftSuggestion({
        generationId: result.data.generation.id,
        text: result.data.draftText,
      })
      setMessage('已生成预览，确认后写入正文')
    } catch {
      setMessage('生成失败：网络或服务器异常')
    } finally {
      setAiBusy(false)
    }
  }

  function openReadingPreview() {
    const live = editorRef.current?.getContent() ?? workingContentRef.current
    workingContentRef.current = live
    setPreviewContent(live)
    setPreviewOpen(true)
  }

  const hasSelection = Boolean(
    selectionHint?.text.trim() || pinnedSelectionRef.current?.text.trim(),
  )
  const showSelectionBubble =
    ((hasSelection && selectionSettled) || selectionActiveOp != null) &&
    !selectionSuggestion &&
    !previewOpen

  return (
    <AppShell
      wide
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      {/* 壳层：导航 + 文档级动作 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/ideas/$ideaId"
          params={{ ideaId: initial.ideaId }}
          className="cz-link text-sm"
        >
          ← 返回想法
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge" aria-live="polite">
            {saveLabel}
          </span>
          <a
            className="btn btn-secondary btn-sm"
            href={`/exports/drafts/${initial.id}`}
          >
            导出
          </a>
          <details className="editor-more">
            <summary className="btn btn-ghost btn-sm">更多</summary>
            <div className="editor-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="editor-more-item"
                disabled={aiBusy || context.fragments.length === 0}
                onClick={() => void regenerateFromFragments()}
              >
                {aiBusy ? '生成中…' : '按碎片重新生成全文'}
              </button>
            </div>
          </details>
        </div>
      </div>

      <p className="muted mb-3 text-sm">
        想法「{context.idea.name}」· {context.fragments.length} 条素材
      </p>

      {recoveryPrompt ? (
        <div className="callout callout-warn mb-4">
          <p className="font-medium">发现未同步的本地草稿</p>
          <p className="muted mt-1 text-sm">
            浏览器里有一份与服务器不同的正文（
            {new Date(recoveryPrompt.savedAt).toLocaleString()}
            ）。不会自动覆盖任一侧。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                titleRef.current = recoveryPrompt.title
                setTitle(recoveryPrompt.title)
                workingContentRef.current = recoveryPrompt.content
                setPreviewContent(recoveryPrompt.content)
                editorRef.current?.replaceDocument(recoveryPrompt.content, {
                  source: 'recovery',
                })
                dirtyRef.current = true
                setSaveState('dirty')
                setRecoveryPrompt(null)
                setMessage('已恢复本地副本，将自动保存')
              }}
            >
              恢复本地
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryPrompt.content)
                setMessage('已复制本地正文')
              }}
            >
              复制本地
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                clearDraftRecovery(initial.id)
                setRecoveryPrompt(null)
                setMessage('已丢弃本地副本')
              }}
            >
              丢弃本地
            </button>
          </div>
        </div>
      ) : null}

      {sourceStaleAt ? (
        <div className="callout callout-warn mb-4">
          <p className="font-medium">素材可能已变更</p>
          <p className="muted mt-1 text-sm">
            正文未必仍匹配最新碎片（{new Date(sourceStaleAt).toLocaleString()}
            ）。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={async () => {
                const result = await clearStale({
                  data: {
                    draftId: initial.id,
                    baseRevision: revisionRef.current,
                  },
                })
                if (!result.ok) {
                  setMessage(result.error.message)
                  return
                }
                revisionRef.current = result.data.revision
                setRevision(result.data.revision)
                setSourceStaleAt(null)
                setMessage('已清除标记')
              }}
            >
              知道了
            </button>
            <Link
              to="/ideas/$ideaId"
              params={{ ideaId: initial.ideaId }}
              className="btn btn-secondary btn-xs"
            >
              回想法
            </Link>
          </div>
        </div>
      ) : null}

      {conflict ? (
        <div className="callout callout-warn mb-4">
          <p className="font-medium">版本冲突</p>
          <p className="muted mt-1 text-sm">
            服务端 revision={conflict.serverRevision}。请选择一侧。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                titleRef.current = conflict.serverTitle
                setTitle(conflict.serverTitle)
                workingContentRef.current = conflict.serverContent
                setPreviewContent(conflict.serverContent)
                revisionRef.current = conflict.serverRevision
                setRevision(conflict.serverRevision)
                editorRef.current?.replaceDocument(conflict.serverContent, {
                  source: 'server',
                })
                dirtyRef.current = false
                setConflict(null)
                setSaveState('idle')
                clearDraftRecovery(initial.id)
                setMessage('已加载服务端版本')
              }}
            >
              使用服务端
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (!window.confirm('确认用本地版本强制覆盖服务端？')) return
                revisionRef.current = conflict.serverRevision
                setRevision(conflict.serverRevision)
                setConflict(null)
                dirtyRef.current = true
                setSaveState('dirty')
                await persist()
              }}
            >
              强制覆盖
            </button>
          </div>
        </div>
      ) : null}

      {/* 编辑器单元：标题 + 贴边工具栏 + 正文 + 按需选区条 */}
      <div className="editor-unit mt-4">
        <input
          className="editor-unit-title"
          value={title}
          onChange={(e) => markTitleDirty(e.target.value)}
          placeholder="标题"
        />

        <div className="editor-unit-toolbar">
          <div className="seg" role="group" aria-label="编辑显示">
            <button
              type="button"
              className="seg-item"
              aria-pressed={editorMode === 'inplace'}
              title="文章样式，仍显示 Markdown 标记"
              onClick={() => setMode('inplace')}
            >
              排版
            </button>
            <button
              type="button"
              className="seg-item"
              aria-pressed={editorMode === 'source'}
              title="纯等宽源码"
              onClick={() => setMode('source')}
            >
              源码
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="撤销 (⌘Z)"
            onClick={() => editorRef.current?.undo()}
          >
            撤销
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="重做"
            onClick={() => editorRef.current?.redo()}
          >
            重做
          </button>
          {lastAiUndoContent != null ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                editorRef.current?.undo()
                setLastAiUndoContent(null)
                setMessage('已撤销上次 AI')
              }}
            >
              撤销 AI
            </button>
          ) : null}
          <div className="editor-unit-toolbar-spacer" />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="弹窗阅读渲染稿"
            onClick={openReadingPreview}
          >
            阅读预览
          </button>
        </div>

        <div className="editor-unit-body">
          <MarkdownEditor
            ref={editorRef}
            initialContent={initial.content}
            mode={editorMode}
            height="min(70dvh, 36rem)"
            placeholder="开始写作… 选中文字可调出 AI 气泡"
            onContentChange={onEditorContentChange}
            onSelectionChange={(sel) => {
              setSelectionHint(sel)
              if (sel?.text.trim()) pinnedSelectionRef.current = sel
            }}
            onSelectionCoords={(coords) => {
              setSelectionCoords(coords)
              if (coords) pinnedCoordsRef.current = coords
            }}
            className="editor-unit-cm"
          />
        </div>
      </div>

      <SelectionAiBubble
        coords={selectionCoords ?? pinnedCoordsRef.current}
        visible={showSelectionBubble}
        activeOp={selectionActiveOp}
        instruction={selectionInstruction}
        onInstructionChange={setSelectionInstruction}
        onRun={(op) => void runSelection(op)}
        onInteract={pinSelectionFromEditor}
      />

      {selectionSuggestion ? (
        <div
          className="selection-ai-panel"
          role="dialog"
          aria-label="选区 AI 结果"
          onPointerDown={(e) => e.preventDefault()}
        >
          <div className="selection-ai-panel-header">
            <p className="font-medium text-sm">
              {selectionSuggestion.operation === 'feedback'
                ? '反馈'
                : `建议 · ${selectionSuggestion.operation}`}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={async () => {
                await rejectGeneration({
                  data: { generationId: selectionSuggestion.generationId },
                })
                setSelectionSuggestion(null)
              }}
            >
              关闭
            </button>
          </div>
          {selectionSuggestion.feedback ? (
            <div className="selection-ai-panel-body text-xs space-y-2">
              <p>{selectionSuggestion.feedback.overall}</p>
              <ul className="list-disc pl-4">
                {selectionSuggestion.feedback.items.map((item, i) => (
                  <li key={i}>
                    [{item.kind}] {item.detail}
                    {item.suggestion ? ` → ${item.suggestion}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : selectionSuggestion.rewrite ? (
            <div className="selection-ai-panel-body text-xs space-y-2">
              <p className="muted">
                {selectionSuggestion.rewrite.summaryOfChange}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="meta mb-1">原文</p>
                  <pre className="selection-ai-panel-pre">
                    {selectionSuggestion.originalText}
                  </pre>
                </div>
                <div>
                  <p className="meta mb-1">建议</p>
                  <pre className="selection-ai-panel-pre">
                    {selectionSuggestion.rewrite.rewrittenText}
                  </pre>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    if (dirtyRef.current) await persist()
                    const before = workingContentRef.current
                    const slice = before.slice(
                      selectionSuggestion.from,
                      selectionSuggestion.to,
                    )
                    const hash = await hashText(slice)
                    if (hash !== selectionSuggestion.hash) {
                      setMessage('选区已过期（正文已变），请重新选择后再试')
                      setSelectionSuggestion(null)
                      return
                    }
                    const result = await acceptSelectionRewrite({
                      data: {
                        generationId: selectionSuggestion.generationId,
                        draftId: initial.id,
                        baseRevision: revisionRef.current,
                        selectionFrom: selectionSuggestion.from,
                        selectionTo: selectionSuggestion.to,
                        selectionHash: selectionSuggestion.hash,
                      },
                    })
                    if (!result.ok) {
                      setMessage(`应用失败：${result.error.message}`)
                      return
                    }
                    setLastAiUndoContent(before)
                    editorRef.current?.replaceRange(
                      {
                        from: selectionSuggestion.from,
                        to: selectionSuggestion.to,
                        insert: selectionSuggestion.rewrite!.rewrittenText,
                      },
                      { source: 'ai', selectResult: true },
                    )
                    workingContentRef.current = result.data.content
                    setPreviewContent(result.data.content)
                    revisionRef.current = result.data.revision
                    setRevision(result.data.revision)
                    setSelectionSuggestion(null)
                    dirtyRef.current = false
                    setSaveState('saved')
                    clearDraftRecovery(initial.id)
                    setMessage('已应用选区 AI')
                  }}
                >
                  接受并替换
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await rejectGeneration({
                      data: {
                        generationId: selectionSuggestion.generationId,
                      },
                    })
                    setSelectionSuggestion(null)
                  }}
                >
                  拒绝
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {draftSuggestion ? (
        <div className="callout callout-info mt-4">
          <p className="font-medium">全文生成预览（确认前不写入）</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-[var(--cz-line)] bg-[var(--cz-surface)] p-2 text-xs">
            {draftSuggestion.text}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={async () => {
                if (dirtyRef.current) await persist()
                const result = await acceptDraftGen({
                  data: {
                    generationId: draftSuggestion.generationId,
                    draftId: initial.id,
                    baseRevision: revisionRef.current,
                  },
                })
                if (!result.ok) {
                  setMessage(result.error.message)
                  return
                }
                editorRef.current?.replaceDocument(result.data.content, {
                  source: 'ai',
                })
                workingContentRef.current = result.data.content
                setPreviewContent(result.data.content)
                revisionRef.current = result.data.revision
                setRevision(result.data.revision)
                setDraftSuggestion(null)
                setSourceStaleAt(null)
                dirtyRef.current = false
                setSaveState('saved')
                clearDraftRecovery(initial.id)
                setMessage('已写入正文')
              }}
            >
              写入正文
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={async () => {
                await rejectGeneration({
                  data: { generationId: draftSuggestion.generationId },
                })
                setDraftSuggestion(null)
              }}
            >
              不用
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="status mt-4" role="status">
          {message}
        </p>
      ) : null}

      {previewOpen ? (
        <div
          className="cz-modal-root"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false)
          }}
        >
          <div
            className="cz-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-preview-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPreviewOpen(false)
            }}
          >
            <div className="cz-modal-header">
              <div>
                <h2 id="draft-preview-title" className="text-sm font-medium">
                  阅读预览
                </h2>
                <p className="meta mt-0.5">
                  只读 · 与排版同一套样式 · 无 Markdown 符号
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  className="btn btn-secondary btn-sm"
                  href={`/exports/drafts/${initial.id}`}
                >
                  导出
                </a>
                <button
                  ref={previewCloseRef}
                  type="button"
                  className="btn btn-primary btn-sm"
                  autoFocus
                  onClick={() => setPreviewOpen(false)}
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="cz-modal-body">
              {title.trim() ? (
                <h1 className="page-title mb-4 text-xl">{title.trim()}</h1>
              ) : null}
              <MarkdownPreview
                content={previewContent}
                className="prose-cz doc-surface max-w-none !p-0 !min-h-0"
              />
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}
