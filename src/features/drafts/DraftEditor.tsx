import { Link, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { AiRewriteBar } from '#/components/editor/AiRewriteBar'
import { MarkdownEditor } from '#/components/editor/MarkdownEditor'
import type {
  EditorMode,
  EditorSelection,
  InlineMark,
  MarkdownEditorHandle,
  SelectionCoords,
} from '#/components/editor/MarkdownEditor'
import { SelectionAiBubble } from '#/components/editor/SelectionAiBubble'
import { isFormatOnlyChange } from '#/components/editor/inplace/ai-inline-diff'
import { isExactImageSelection } from '#/components/editor/inplace/image-select'
import { resolveInplaceCapability } from '#/components/editor/inplace/platform-policy'
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
import {
  IconCheck,
  IconClose,
  IconMore,
  IconSpinner,
} from '#/components/ui/icons'
import { logoutFn } from '#/features/auth/auth.functions'
import {
  clearDraftStaleFn,
  saveDraftFn,
} from '#/features/drafts/drafts.functions'
import {
  acceptSelectionRewriteFn,
  rejectGenerationFn,
  runSelectionAiFn,
} from '#/features/generations/generations.functions'
import type {
  SelectionFeedback,
  SelectionRewrite,
} from '#/server/ai/schemas/selection'
import { hashText } from '#/shared/text-hash'
import type { DraftEditorContext } from '#/modules/drafts/drafts.service'

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict'

const MODE_STORAGE_KEY = 'chengzhang:editor-mode'
const STILL_STORAGE_KEY = 'chengzhang:stillness'

function loadStillness() {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(STILL_STORAGE_KEY) === '1'
}

function loadStoredMode(): EditorMode {
  if (typeof localStorage === 'undefined') return 'inplace'
  const v = localStorage.getItem(MODE_STORAGE_KEY)
  return v === 'source' ? 'source' : 'inplace'
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^["']|["']$/g, ''))
    } catch {
      // fall through to ASCII filename
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header)
  if (quoted?.[1]) return quoted[1]
  const plain = /filename=([^;]+)/i.exec(header)
  return plain?.[1]?.trim() ?? null
}

export function DraftEditor({
  context,
  composeRequested = false,
  embedded = false,
  userLabel,
  onLogout,
}: {
  context: DraftEditorContext
  composeRequested?: boolean
  embedded?: boolean
  userLabel?: string
  onLogout?: () => void
}) {
  const initial = context.draft
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const saveDraft = useServerFn(saveDraftFn)
  const clearStale = useServerFn(clearDraftStaleFn)
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
  const [stillness, setStillness] = useState(loadStillness)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [chromeSlot, setChromeSlot] = useState<HTMLElement | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState(initial.content)
  const previewCloseRef = useRef<HTMLButtonElement>(null)
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
  const [composingArticle, setComposingArticle] = useState(false)
  const [composeConfirm, setComposeConfirm] = useState(false)
  const composeLockRef = useRef(false)
  const composeAbortRef = useRef<AbortController | null>(null)
  const composeStartedRef = useRef(false)
  const selectionRunRef = useRef(0)
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
  const suggestionRef = useRef(selectionSuggestion)
  suggestionRef.current = selectionSuggestion
  const [rewriteCoords, setRewriteCoords] = useState<SelectionCoords | null>(
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

  // Wait until selection is stable before showing the bubble.
  // Once visible, keep it up through wrap/unwrap so format clicks don't flash it away.
  useEffect(() => {
    const hasText = Boolean(selectionHint?.text.trim())
    if (!hasText) {
      setSelectionSettled(false)
      return
    }
    if (selectionSettled) return
    const from = selectionHint!.from
    const to = selectionHint!.to
    const timer = window.setTimeout(() => {
      const cur = editorRef.current?.getSelection()
      if (cur && cur.from === from && cur.to === to && cur.text.trim()) {
        setSelectionSettled(true)
      }
    }, 380)
    return () => window.clearTimeout(timer)
  }, [
    selectionHint?.from,
    selectionHint?.to,
    selectionHint?.text,
    selectionSettled,
  ])

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
    if (composeLockRef.current) return
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

  function setStill(next: boolean) {
    setStillness(next)
    try {
      localStorage.setItem(STILL_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setStill(!stillness)
        return
      }
      if (e.key === 'Escape') {
        if (menuOpen) {
          e.preventDefault()
          setMenuOpen(false)
          return
        }
        if (stillness && !previewOpen) {
          e.preventDefault()
          setStill(false)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stillness, previewOpen, menuOpen])

  useEffect(() => {
    if (!embedded) {
      setChromeSlot(null)
      return
    }
    setChromeSlot(document.getElementById('idea-write-chrome'))
  }, [embedded])

  useEffect(() => {
    if (!menuOpen) return
    function onPointer(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [menuOpen])

  function setMode(next: EditorMode) {
    setEditorMode(next)
    editorRef.current?.setMode(next)
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }

  function applyInlineMark(mark: InlineMark, url?: string) {
    const sel =
      editorRef.current?.getSelection() ??
      editorRef.current?.getLogicalSelection() ??
      pinnedSelectionRef.current
    if (!sel?.text.trim()) return
    pinnedSelectionRef.current = sel
    editorRef.current?.toggleInlineMark(mark, url, {
      from: sel.from,
      to: sel.to,
    })
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
    const runId = selectionRunRef.current + 1
    selectionRunRef.current = runId
    setSelectionActiveOp(operation)
    setMessage(null)
    editorRef.current?.setGeneratingRange({ from: sel.from, to: sel.to })
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
      if (selectionRunRef.current !== runId) return
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
        releaseSelection(result.data.selectionTo)
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
        releaseSelection(result.data.selectionTo)
      }
    } catch {
      if (selectionRunRef.current !== runId) return
      setMessage('选区 AI 失败：网络或服务器异常')
    } finally {
      if (selectionRunRef.current === runId) {
        setSelectionActiveOp(null)
        editorRef.current?.setGeneratingRange(null)
      }
    }
  }

  function cancelSelectionAi() {
    selectionRunRef.current += 1
    setSelectionActiveOp(null)
    editorRef.current?.setGeneratingRange(null)
    setMessage(null)
  }

  function releaseSelection(cursorAt?: number) {
    pinnedSelectionRef.current = null
    pinnedCoordsRef.current = null
    setSelectionHint(null)
    setSelectionSettled(false)
    setSelectionInstruction('')
    editorRef.current?.clearLogicalSelection()
    if (cursorAt != null) editorRef.current?.setCursor(cursorAt)
  }

  const inlineRewrite =
    editorMode === 'inplace' &&
    Boolean(selectionSuggestion?.rewrite) &&
    resolveInplaceCapability({ mode: 'inplace' }).aiInlineDiff

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (inlineRewrite && selectionSuggestion?.rewrite) {
      editor.setPendingRewrite({
        from: selectionSuggestion.from,
        to: selectionSuggestion.to,
        original: selectionSuggestion.originalText,
        rewritten: selectionSuggestion.rewrite.rewrittenText,
      })
      return
    }
    editor.clearPendingRewrite()
  }, [inlineRewrite, selectionSuggestion])

  useEffect(() => {
    if (!inlineRewrite || !selectionSuggestion) {
      setRewriteCoords(null)
      return
    }
    const update = () => {
      setRewriteCoords(
        editorRef.current?.getRangeCoords(
          selectionSuggestion.from,
          selectionSuggestion.to,
        ) ?? null,
      )
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [inlineRewrite, selectionSuggestion])

  async function acceptRewrite() {
    if (!selectionSuggestion?.rewrite) return
    if (dirtyRef.current) await persist()
    const before = workingContentRef.current
    const slice = before.slice(selectionSuggestion.from, selectionSuggestion.to)
    const hash = await hashText(slice)
    if (hash !== selectionSuggestion.hash) {
      editorRef.current?.clearPendingRewrite()
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
    editorRef.current?.clearPendingRewrite()
    editorRef.current?.replaceRange(
      {
        from: selectionSuggestion.from,
        to: selectionSuggestion.to,
        insert: selectionSuggestion.rewrite.rewrittenText,
      },
      { source: 'ai', selectResult: false },
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
    releaseSelection(
      selectionSuggestion.from +
        selectionSuggestion.rewrite.rewrittenText.length,
    )
  }

  async function rejectRewrite() {
    if (!selectionSuggestion) return
    const cursorAt = selectionSuggestion.to
    editorRef.current?.clearPendingRewrite()
    await rejectGeneration({
      data: { generationId: selectionSuggestion.generationId },
    })
    setSelectionSuggestion(null)
    releaseSelection(cursorAt)
  }

  const saveLabel =
    saveState === 'saving'
      ? '保存'
      : saveState === 'saved'
        ? '已保存'
        : saveState === 'dirty'
          ? '未保存'
          : saveState === 'failed'
            ? '保存失败'
            : saveState === 'conflict'
              ? '版本冲突'
              : '就绪'

  const streamCompose = useCallback(async () => {
    if (composeLockRef.current) return
    composeLockRef.current = true
    setComposingArticle(true)
    setComposeConfirm(false)
    setMessage('正在根据碎片写文章…')
    const abort = new AbortController()
    composeAbortRef.current = abort
    let first = true
    let acc = ''
    try {
      const response = await fetch(`/api/drafts/${initial.id}/compose`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: initial.ideaId }),
        signal: abort.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(
          response.status === 401 ? '请先登录' : '生成失败，请稍后重试',
        )
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as
            | { type: 'delta'; text: string }
            | { type: 'done'; generationId: string; text: string }
            | { type: 'error'; message: string }
          if (event.type === 'delta') {
            acc += event.text
            if (first) {
              editorRef.current?.replaceDocument(acc, {
                source: 'ai',
                addToHistory: true,
              })
              first = false
            } else {
              editorRef.current?.replaceRange(
                {
                  from: acc.length - event.text.length,
                  to: acc.length - event.text.length,
                  insert: event.text,
                },
                { source: 'ai', addToHistory: false },
              )
            }
            workingContentRef.current = acc
          } else if (
            event.type === 'done' &&
            event.text &&
            event.text !== acc
          ) {
            acc = event.text
            editorRef.current?.replaceDocument(acc, {
              source: 'ai',
              addToHistory: false,
            })
            workingContentRef.current = acc
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        }
      }
      workingContentRef.current = acc
      setPreviewContent(acc)
      dirtyRef.current = true
      setSaveState('dirty')
      setMessage(acc.trim() ? '已写入正文，可继续改' : '没有生成内容')
    } catch (error) {
      if (abort.signal.aborted) {
        workingContentRef.current = acc
        if (acc.trim()) {
          dirtyRef.current = true
          setSaveState('dirty')
        }
        setMessage(acc.trim() ? '已停止，保留已写出的部分' : '已取消生成')
      } else {
        const text = error instanceof Error ? error.message : '生成失败'
        setMessage(`生成失败：${text}`)
      }
    } finally {
      composeLockRef.current = false
      composeAbortRef.current = null
      setComposingArticle(false)
    }
  }, [initial.id, initial.ideaId])

  function requestCompose() {
    if (composingArticle) return
    if ((editorRef.current?.getContent() ?? workingContentRef.current).trim()) {
      setComposeConfirm(true)
      return
    }
    void streamCompose()
  }

  useEffect(() => {
    if (!composeRequested || composeStartedRef.current) return
    composeStartedRef.current = true
    void navigate({
      to: '/drafts/$draftId',
      params: { draftId: initial.id },
      search: { compose: false },
      replace: true,
    })
    requestCompose()
  }, [composeRequested, initial.id, navigate])

  function openExportPreview() {
    const live = editorRef.current?.getContent() ?? workingContentRef.current
    workingContentRef.current = live
    setPreviewContent(live)
    setPreviewOpen(true)
  }

  async function downloadExport() {
    if (!title.trim()) {
      setMessage('导出前需要标题')
      return
    }
    if (dirtyRef.current) await persist()
    if (dirtyRef.current) {
      setMessage('请先保存后再导出')
      return
    }
    try {
      const response = await fetch(`/exports/drafts/${initial.id}`, {
        credentials: 'same-origin',
      })
      if (!response.ok) {
        const detail = (await response.text()).trim()
        setMessage(detail || '导出失败')
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download =
        filenameFromDisposition(response.headers.get('Content-Disposition')) ||
        'draft.md'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setMessage('导出失败')
    }
  }

  const selectionText =
    selectionHint?.text.trim() || pinnedSelectionRef.current?.text.trim() || ''
  const hasSelection = Boolean(selectionText)
  const showSelectionBubble =
    ((hasSelection && selectionSettled) || selectionActiveOp != null) &&
    !isExactImageSelection(selectionText) &&
    !selectionSuggestion &&
    !previewOpen &&
    !composingArticle

  const chrome = (
    <>
      {saveState !== 'idle' ? (
        <span className="badge editor-save-status" aria-live="polite">
          {saveState === 'saving' ? <IconSpinner size={10} /> : null}
          {saveLabel}
        </span>
      ) : null}
      <div ref={menuRef} className="editor-more editor-still-chrome">
        <button
          type="button"
          className="editor-more-trigger"
          aria-label="更多"
          title="更多"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <IconMore size={16} />
        </button>
        {menuOpen ? (
          <div className="editor-more-menu" role="menu">
            {embedded ? null : (
              <Link
                to="/ideas/$ideaId"
                params={{ ideaId: initial.ideaId }}
                className="editor-more-item"
                role="menuitem"
              >
                返回想法
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              className="editor-more-item"
              aria-pressed={editorMode === 'inplace'}
              onClick={() => setMode('inplace')}
            >
              排版
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-more-item"
              aria-pressed={editorMode === 'source'}
              onClick={() => setMode('source')}
            >
              源码
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-more-item"
              onClick={() => {
                setMenuOpen(false)
                openExportPreview()
              }}
            >
              导出
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-more-item"
              disabled={composingArticle || context.fragments.length === 0}
              onClick={() => {
                setMenuOpen(false)
                requestCompose()
              }}
            >
              {composingArticle ? '正在写…' : '用碎片重写全文'}
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-more-item"
              aria-pressed={stillness}
              onClick={() => {
                setMenuOpen(false)
                setStill(!stillness)
              }}
            >
              {stillness ? '退出专注' : '专注'}
            </button>
          </div>
        ) : null}
      </div>
    </>
  )

  const editor = (
    <div
      className={
        embedded ? 'draft-editor-paper is-embed' : 'draft-editor-paper'
      }
    >
      {embedded ? (
        chromeSlot ? (
          createPortal(chrome, chromeSlot)
        ) : null
      ) : (
        <div className="editor-paper-corner">{chrome}</div>
      )}

      {composingArticle ? (
        <div className="callout callout-info mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-sm">正在根据碎片写进正文…</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => composeAbortRef.current?.abort()}
          >
            停止
          </button>
        </div>
      ) : null}

      {composeConfirm ? (
        <div className="callout callout-warn mb-4">
          <p className="font-medium">用碎片重写当前文章？</p>
          <p className="muted mt-1 text-sm">
            现有正文会被替换。可用撤销找回这一版。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void streamCompose()}
            >
              重写
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setComposeConfirm(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

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

      <div className={`editor-unit${stillness ? ' editor-unit-still' : ''}`}>
        <input
          className="editor-unit-title"
          value={title}
          onChange={(e) => markTitleDirty(e.target.value)}
          placeholder="标题"
        />

        <div className="editor-unit-body">
          <MarkdownEditor
            ref={editorRef}
            initialContent={initial.content}
            mode={editorMode}
            height="auto"
            placeholder="开始写作… 选中文字可调格式或用 AI"
            onContentChange={onEditorContentChange}
            onSelectionChange={(sel) => {
              setSelectionHint(sel)
              if (sel?.text.trim()) pinnedSelectionRef.current = sel
            }}
            onSelectionCoords={(coords) => {
              setSelectionCoords(coords)
              if (coords) pinnedCoordsRef.current = coords
            }}
            onPendingRewriteDiscarded={() => {
              const current = suggestionRef.current
              if (!current?.rewrite) return
              suggestionRef.current = null
              setSelectionSuggestion(null)
              releaseSelection()
              setMessage('正文已改，已丢弃未确认的建议')
              void rejectGeneration({
                data: { generationId: current.generationId },
              })
            }}
            className={`editor-unit-cm${composingArticle ? ' is-composing' : ''}`}
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
        onCancel={cancelSelectionAi}
        onInteract={pinSelectionFromEditor}
        activeMarks={
          selectionHint?.marks ?? pinnedSelectionRef.current?.marks ?? []
        }
        onFormat={(mark) => applyInlineMark(mark)}
        onToggleLink={(url) => applyInlineMark('link', url)}
      />

      {inlineRewrite ? (
        <AiRewriteBar
          coords={rewriteCoords}
          summary={selectionSuggestion?.rewrite?.summaryOfChange}
          formatOnly={Boolean(
            selectionSuggestion?.rewrite &&
            isFormatOnlyChange(
              selectionSuggestion.originalText,
              selectionSuggestion.rewrite.rewrittenText,
            ),
          )}
          onAccept={() => void acceptRewrite()}
          onReject={() => void rejectRewrite()}
        />
      ) : null}

      {selectionSuggestion && !inlineRewrite ? (
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
              onClick={() => void rejectRewrite()}
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
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  aria-label="拒绝"
                  title="拒绝"
                  onClick={() => void rejectRewrite()}
                >
                  <IconClose size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-icon"
                  aria-label="接受并替换"
                  title="接受并替换"
                  onClick={() => void acceptRewrite()}
                >
                  <IconCheck size={15} />
                </button>
              </div>
            </div>
          ) : null}
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
                  导出预览
                </h2>
                <p className="meta mt-0.5">
                  核对排版后下载。文中有本地图片时会打成 zip，链接改成相对路径。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPreviewOpen(false)}
                >
                  取消
                </button>
                <button
                  ref={previewCloseRef}
                  type="button"
                  className="btn btn-primary btn-sm"
                  autoFocus
                  onClick={() => void downloadExport()}
                >
                  下载
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
    </div>
  )

  if (embedded) return editor

  return (
    <AppShell
      wide
      quiet={stillness}
      userLabel={userLabel}
      onLogout={async () => {
        if (onLogout) {
          await onLogout()
          return
        }
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      {editor}
    </AppShell>
  )
}
