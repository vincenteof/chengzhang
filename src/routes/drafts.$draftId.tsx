import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MarkdownEditor } from '#/components/editor/MarkdownEditor'
import { MarkdownPreview } from '#/components/editor/MarkdownPreview'
import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import {
  completeDraftFn,
  getDraftFn,
  reopenDraftFn,
  saveDraftFn,
} from '#/features/drafts/drafts.functions'
import type { DraftRecord } from '#/modules/drafts/drafts.service'

export const Route = createFileRoute('/drafts/$draftId')({
  loader: async ({ params }) => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const draft = await getDraftFn({ data: { draftId: params.draftId } })
    if (!draft.ok) {
      throw redirect({ to: '/ideas' })
    }
    return { user: session.data.user, draft: draft.data }
  },
  component: DraftEditorPage,
})

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict'

function DraftEditorPage() {
  const { user, draft: initial } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const saveDraft = useServerFn(saveDraftFn)
  const completeDraft = useServerFn(completeDraftFn)
  const reopenDraft = useServerFn(reopenDraftFn)

  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description ?? '')
  const [slug, setSlug] = useState(initial.slug ?? '')
  const [tags, setTags] = useState(initial.tags.join(', '))
  const [content, setContent] = useState(initial.content)
  const [revision, setRevision] = useState(initial.revision)
  const [status, setStatus] = useState(initial.status)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{
    serverRevision: number
    serverContent: string
    serverTitle: string
  } | null>(null)

  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const snapshotRef = useRef({
    title,
    description,
    slug,
    tags,
    content,
    revision,
  })

  useEffect(() => {
    snapshotRef.current = { title, description, slug, tags, content, revision }
  }, [title, description, slug, tags, content, revision])

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
          description: snap.description || null,
          slug: snap.slug || null,
          tags: snap.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
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
      setMessage(null)
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
    setDescription(draft.description ?? '')
    setSlug(draft.slug ?? '')
    setTags(draft.tags.join(', '))
    setContent(draft.content)
    setRevision(draft.revision)
    setStatus(draft.status)
    setConflict(null)
  }

  function markDirty(
    updater: () => void,
  ) {
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
  }, [saveState, title, description, slug, tags, content, persist])

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
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link
          to="/ideas/$ideaId"
          params={{ ideaId: initial.ideaId }}
          className="text-blue-700 underline"
        >
          ← 返回 Idea
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-neutral-500">{saveLabel}</span>
          <a
            className="rounded border border-neutral-300 px-2 py-1"
            href={`/exports/drafts/${initial.id}`}
          >
            导出 Markdown
          </a>
          {status === 'drafting' ? (
            <button
              type="button"
              className="rounded bg-neutral-900 px-2 py-1 text-white"
              onClick={async () => {
                await persist()
                const result = await completeDraft({
                  data: { id: initial.id, baseRevision: revision },
                })
                if (!result.ok) {
                  setMessage(result.error.message)
                  return
                }
                applyServerDraft(result.data)
                setMessage('已标记完成（导出不自动等于完成）')
                await router.invalidate()
              }}
            >
              标记完成
            </button>
          ) : (
            <button
              type="button"
              className="rounded border px-2 py-1"
              onClick={async () => {
                const result = await reopenDraft({
                  data: { id: initial.id, baseRevision: revision },
                })
                if (!result.ok) {
                  setMessage(result.error.message)
                  return
                }
                applyServerDraft(result.data)
                setMessage('已恢复为编辑中')
              }}
            >
              恢复编辑
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <input
          className="w-full rounded border border-neutral-300 px-3 py-2 text-xl font-semibold"
          value={title}
          onChange={(e) => markDirty(() => setTitle(e.target.value))}
          placeholder="标题"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            value={description}
            onChange={(e) => markDirty(() => setDescription(e.target.value))}
            placeholder="摘要（可选）"
          />
          <input
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            value={slug}
            onChange={(e) => markDirty(() => setSlug(e.target.value))}
            placeholder="slug（可选）"
          />
          <input
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            value={tags}
            onChange={(e) => markDirty(() => setTags(e.target.value))}
            placeholder="标签，逗号分隔"
          />
        </div>
      </div>

      {conflict ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium">版本冲突</p>
          <p className="mt-1 text-neutral-700">
            服务端 revision={conflict.serverRevision}。Alpha 不自动合并。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border bg-white px-2 py-1"
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
              className="rounded border bg-white px-2 py-1"
              onClick={async () => {
                await navigator.clipboard.writeText(content)
                setMessage('已复制当前本地正文')
              }}
            >
              复制本地正文
            </button>
            <button
              type="button"
              className="rounded bg-red-700 px-2 py-1 text-white"
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <MarkdownEditor
          value={content}
          onChange={(value) => markDirty(() => setContent(value))}
        />
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-600">预览</h2>
          <MarkdownPreview content={content} />
        </div>
      </div>

      {message ? (
        <p className="mt-4 text-sm text-neutral-600" role="status">
          {message}
        </p>
      ) : null}
    </AppShell>
  )
}
