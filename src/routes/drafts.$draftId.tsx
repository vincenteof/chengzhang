import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MarkdownEditor } from '#/components/editor/MarkdownEditor'
import { MarkdownPreview } from '#/components/editor/MarkdownPreview'
import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import {
  clearDraftStaleFn,
  getDraftEditorContextFn,
  saveDraftFn,
} from '#/features/drafts/drafts.functions'
import {
  acceptDraftGenerationFn,
  generateDraftFn,
  rejectGenerationFn,
} from '#/features/generations/generations.functions'
import type { DraftRecord } from '#/modules/drafts/drafts.service'

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

function DraftEditorPage() {
  const { user, context } = Route.useLoaderData()
  const initial = context.draft
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const saveDraft = useServerFn(saveDraftFn)
  const clearStale = useServerFn(clearDraftStaleFn)
  const generateDraft = useServerFn(generateDraftFn)
  const acceptDraftGen = useServerFn(acceptDraftGenerationFn)
  const rejectGeneration = useServerFn(rejectGenerationFn)

  const [title, setTitle] = useState(initial.title)
  const [content, setContent] = useState(initial.content)
  const [revision, setRevision] = useState(initial.revision)
  const [sourceStaleAt, setSourceStaleAt] = useState(initial.sourceStaleAt)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [suggestion, setSuggestion] = useState<{
    generationId: string
    text: string
  } | null>(null)
  const [conflict, setConflict] = useState<{
    serverRevision: number
    serverContent: string
    serverTitle: string
  } | null>(null)

  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const snapshotRef = useRef({ title, content, revision })

  useEffect(() => {
    snapshotRef.current = { title, content, revision }
  }, [title, content, revision])

  useEffect(() => {
    setTitle(initial.title)
    setContent(initial.content)
    setRevision(initial.revision)
    setSourceStaleAt(initial.sourceStaleAt)
  }, [initial])

  const persist = useCallback(async () => {
    if (savingRef.current) {
      pendingRef.current = true
      return
    }
    savingRef.current = true
    setSaveState('saving')
    const snap = snapshotRef.current
    try {
      const result = await saveDraft({
        data: {
          id: initial.id,
          baseRevision: snap.revision,
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
            serverRevision: Number(details?.serverRevision ?? snap.revision + 1),
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
      applyServerDraft(result.data)
      dirtyRef.current = false
      setSaveState('saved')
    } catch {
      setSaveState('failed')
      setMessage('保存失败，本地内容仍在')
    } finally {
      savingRef.current = false
      if (pendingRef.current) {
        pendingRef.current = false
        void persist()
      }
    }
  }, [initial.id, saveDraft])

  function applyServerDraft(draft: DraftRecord) {
    setTitle(draft.title)
    setContent(draft.content)
    setRevision(draft.revision)
    setSourceStaleAt(draft.sourceStaleAt)
    setConflict(null)
  }

  function markDirty(updater: () => void) {
    updater()
    dirtyRef.current = true
    setSaveState('dirty')
  }

  useEffect(() => {
    if (saveState !== 'dirty') return
    const timer = window.setTimeout(() => {
      void persist()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [saveState, title, content, persist])

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

  return (
    <AppShell
      wide
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/ideas/$ideaId"
          params={{ ideaId: initial.ideaId }}
          className="cz-link text-sm"
        >
          ← 返回想法
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">{saveLabel}</span>
          <button
            type="button"
            disabled={aiBusy || context.fragments.length === 0}
            className="btn btn-secondary btn-sm"
            onClick={async () => {
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
                setSuggestion({
                  generationId: result.data.generation.id,
                  text: result.data.draftText,
                })
                setMessage('已生成预览，确认后写入正文')
              } catch {
                setMessage('生成失败：网络或服务器异常')
              } finally {
                setAiBusy(false)
              }
            }}
          >
            {aiBusy ? '生成中…' : '重新根据碎片生成'}
          </button>
          <a
            className="btn btn-secondary btn-sm"
            href={`/exports/drafts/${initial.id}`}
          >
            导出 Markdown
          </a>
        </div>
      </div>

      <p className="section-kicker">文章</p>
      <p className="muted mb-4 mt-1 text-sm">
        想法「{context.idea.name}」· {context.fragments.length} 条素材
      </p>

      {sourceStaleAt ? (
        <div className="callout callout-warn mb-4">
          <p className="font-medium">素材可能已变更</p>
          <p className="muted mt-1">
            正文未必仍匹配最新碎片（{new Date(sourceStaleAt).toLocaleString()}）。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={async () => {
                const result = await clearStale({
                  data: { draftId: initial.id, baseRevision: revision },
                })
                if (!result.ok) {
                  setMessage(result.error.message)
                  return
                }
                applyServerDraft(result.data)
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

      <div className="space-y-3">
        <input
          className="input input-title"
          value={title}
          onChange={(e) => markDirty(() => setTitle(e.target.value))}
          placeholder="标题"
        />
      </div>

      {conflict ? (
        <div className="callout callout-warn mt-4">
          <p className="font-medium">版本冲突</p>
          <p className="muted mt-1">
            服务端 revision={conflict.serverRevision}。请选择一侧版本。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setTitle(conflict.serverTitle)
                setContent(conflict.serverContent)
                setRevision(conflict.serverRevision)
                setConflict(null)
                setSaveState('idle')
                setMessage('已加载服务端版本')
              }}
            >
              使用服务端版本
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (!window.confirm('确认用本地版本强制覆盖服务端？')) return
                setRevision(conflict.serverRevision)
                snapshotRef.current.revision = conflict.serverRevision
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

      {suggestion ? (
        <div className="callout callout-info mt-4">
          <p className="font-medium">生成预览（确认前不会写入正文）</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--cz-radius-sm)] border border-[var(--cz-line)] bg-[var(--cz-surface)] p-2 text-xs">
            {suggestion.text}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={async () => {
                if (dirtyRef.current) await persist()
                const result = await acceptDraftGen({
                  data: {
                    generationId: suggestion.generationId,
                    draftId: initial.id,
                    baseRevision: revision,
                  },
                })
                if (!result.ok) {
                  setMessage(result.error.message)
                  return
                }
                setContent(result.data.content)
                setRevision(result.data.revision)
                setSuggestion(null)
                setSourceStaleAt(null)
                setSaveState('saved')
                setMessage('已写入正文')
                await router.invalidate()
              }}
            >
              写入正文
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={async () => {
                await rejectGeneration({
                  data: { generationId: suggestion.generationId },
                })
                setSuggestion(null)
                setMessage('已丢弃预览')
              }}
            >
              不用
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <MarkdownEditor
            value={content}
            onChange={(value) => markDirty(() => setContent(value))}
            height="480px"
          />
        </div>
        <div className="min-w-0">
          <h2 className="muted mb-2 text-sm font-medium">预览</h2>
          <MarkdownPreview content={content} />
        </div>
      </div>

      {message ? (
        <p className="status mt-4" role="status">
          {message}
        </p>
      ) : null}
    </AppShell>
  )
}
