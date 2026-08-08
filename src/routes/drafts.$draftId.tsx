import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MarkdownEditor } from '#/components/editor/MarkdownEditor'
import { MarkdownPreview } from '#/components/editor/MarkdownPreview'
import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import {
  clearDraftStaleFn,
  completeDraftFn,
  getDraftEditorContextFn,
  reopenDraftFn,
  saveDraftFn,
} from '#/features/drafts/drafts.functions'
import {
  acceptDraftGenerationFn,
  generateDraftFn,
  rejectGenerationFn,
} from '#/features/generations/generations.functions'
import type { DraftRecord } from '#/modules/drafts/drafts.service'
import type { Outline } from '#/server/db/schema'
import { createId } from '#/shared/ids'

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

function staleLabel(reason: string | null) {
  if (reason === 'claim_changed') return '主张已变更'
  if (reason === 'material_changed') return '素材已变更'
  if (reason === 'outline_changed') return '结构已变更'
  return '来源可能已过期'
}

function DraftEditorPage() {
  const { user, context } = Route.useLoaderData()
  const initial = context.draft
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const saveDraft = useServerFn(saveDraftFn)
  const completeDraft = useServerFn(completeDraftFn)
  const reopenDraft = useServerFn(reopenDraftFn)
  const clearStale = useServerFn(clearDraftStaleFn)
  const generateDraft = useServerFn(generateDraftFn)
  const acceptDraftGen = useServerFn(acceptDraftGenerationFn)
  const rejectGeneration = useServerFn(rejectGenerationFn)

  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description ?? '')
  const [slug, setSlug] = useState(initial.slug ?? '')
  const [tags, setTags] = useState(initial.tags.join(', '))
  const [content, setContent] = useState(initial.content)
  const [outline, setOutline] = useState<Outline>(
    initial.outline ?? {
      schemaVersion: 1,
      title: initial.title,
      approach: '',
      sections: [],
    },
  )
  const [revision, setRevision] = useState(initial.revision)
  const [status, setStatus] = useState(initial.status)
  const [sourceStaleAt, setSourceStaleAt] = useState(initial.sourceStaleAt)
  const [sourceStaleReason, setSourceStaleReason] = useState(
    initial.sourceStaleReason,
  )
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [draftSuggestion, setDraftSuggestion] = useState<{
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
  const snapshotRef = useRef({
    title,
    description,
    slug,
    tags,
    content,
    outline,
    revision,
  })

  useEffect(() => {
    snapshotRef.current = {
      title,
      description,
      slug,
      tags,
      content,
      outline,
      revision,
    }
  }, [title, description, slug, tags, content, outline, revision])

  useEffect(() => {
    setTitle(initial.title)
    setDescription(initial.description ?? '')
    setSlug(initial.slug ?? '')
    setTags(initial.tags.join(', '))
    setContent(initial.content)
    setOutline(
      initial.outline ?? {
        schemaVersion: 1,
        title: initial.title,
        approach: '',
        sections: [],
      },
    )
    setRevision(initial.revision)
    setStatus(initial.status)
    setSourceStaleAt(initial.sourceStaleAt)
    setSourceStaleReason(initial.sourceStaleReason)
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
          description: snap.description || null,
          slug: snap.slug || null,
          tags: snap.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          content: snap.content,
          outline: snap.outline,
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
    setDescription(draft.description ?? '')
    setSlug(draft.slug ?? '')
    setTags(draft.tags.join(', '))
    setContent(draft.content)
    setOutline(
      draft.outline ?? {
        schemaVersion: 1,
        title: draft.title,
        approach: '',
        sections: [],
      },
    )
    setRevision(draft.revision)
    setStatus(draft.status)
    setSourceStaleAt(draft.sourceStaleAt)
    setSourceStaleReason(draft.sourceStaleReason)
    setConflict(null)
  }

  function markDirty(updater: () => void) {
    updater()
    dirtyRef.current = true
    setSaveState('dirty')
  }

  function updateSection(
    index: number,
    patch: Partial<Outline['sections'][number]>,
  ) {
    markDirty(() => {
      setOutline((prev) => {
        const sections = prev.sections.map((s, i) =>
          i === index ? { ...s, ...patch } : s,
        )
        return { ...prev, sections }
      })
    })
  }

  function moveSection(index: number, dir: -1 | 1) {
    const next = index + dir
    if (next < 0 || next >= outline.sections.length) return
    markDirty(() => {
      setOutline((prev) => {
        const sections = [...prev.sections]
        const tmp = sections[index]!
        sections[index] = sections[next]!
        sections[next] = tmp
        return { ...prev, sections }
      })
    })
  }

  useEffect(() => {
    if (saveState !== 'dirty') return
    const timer = window.setTimeout(() => {
      void persist()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [saveState, title, description, slug, tags, content, outline, persist])

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

  const fragmentLabel = (id: string) => {
    const f = context.fragments.find((x) => x.id === id)
    if (!f) return id
    const t = f.content.trim().replace(/\s+/g, ' ')
    return t.length > 36 ? `${t.slice(0, 36)}…` : t
  }

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
          <button
            type="button"
            disabled={aiBusy || !context.idea.confirmedClaim}
            className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-50"
            onClick={async () => {
              setAiBusy(true)
              setMessage('正在生成初稿…（可能需数十秒）')
              try {
                if (dirtyRef.current) await persist()
                const result = await generateDraft({
                  data: {
                    ideaId: initial.ideaId,
                    draftId: initial.id,
                  },
                })
                if (!result.ok) {
                  setMessage(`初稿失败：${result.error.message}`)
                  return
                }
                setDraftSuggestion({
                  generationId: result.data.generation.id,
                  text: result.data.draftText,
                })
                setMessage('初稿建议已生成，确认后才会写入正文')
              } catch {
                setMessage('初稿失败：网络或服务器异常')
              } finally {
                setAiBusy(false)
              }
            }}
          >
            {aiBusy ? '生成中…' : 'AI 生成初稿'}
          </button>
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

      <p className="mb-3 text-sm text-neutral-600">
        Idea「{context.idea.name}」
        {context.idea.confirmedClaim
          ? ` · 主张：${context.idea.confirmedClaim.slice(0, 80)}${context.idea.confirmedClaim.length > 80 ? '…' : ''}`
          : ' · 尚未确认主张（生成初稿前请先确认）'}
      </p>

      {sourceStaleAt ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">草稿来源可能已过期</p>
          <p className="mt-1 text-neutral-700">
            {staleLabel(sourceStaleReason)}
            （{new Date(sourceStaleAt).toLocaleString()}）。结构或正文未必仍匹配最新素材/主张。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border bg-white px-2 py-1 text-xs"
              onClick={async () => {
                const result = await clearStale({
                  data: { draftId: initial.id, baseRevision: revision },
                })
                if (!result.ok) {
                  setMessage(result.error.message)
                  return
                }
                applyServerDraft(result.data)
                setMessage('已清除过期标记（内容未自动改写）')
              }}
            >
              知道了，清除标记
            </button>
            <Link
              to="/ideas/$ideaId"
              params={{ ideaId: initial.ideaId }}
              className="rounded border bg-white px-2 py-1 text-xs"
            >
              回 Idea 重新生成结构/初稿
            </Link>
          </div>
        </div>
      ) : null}

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

      {draftSuggestion ? (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-medium">初稿建议（确认前不会写入正文）</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs">
            {draftSuggestion.text}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
              onClick={async () => {
                if (dirtyRef.current) await persist()
                const result = await acceptDraftGen({
                  data: {
                    generationId: draftSuggestion.generationId,
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
                setDraftSuggestion(null)
                setSourceStaleAt(null)
                setSourceStaleReason(null)
                setSaveState('saved')
                setMessage('初稿已写入正文，可继续修改')
                await router.invalidate()
              }}
            >
              接受初稿
            </button>
            <button
              type="button"
              className="rounded border bg-white px-2 py-1 text-xs"
              onClick={async () => {
                await rejectGeneration({
                  data: { generationId: draftSuggestion.generationId },
                })
                setDraftSuggestion(null)
                setMessage('已拒绝初稿建议')
              }}
            >
              拒绝
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[280px_1fr_1fr]">
        <aside className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div>
            <h2 className="text-sm font-medium">文章结构</h2>
            <p className="mt-1 text-xs text-neutral-500">
              可改章节标题/目的、排序；会随草稿自动保存。
            </p>
          </div>
          <input
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
            value={outline.approach}
            onChange={(e) =>
              markDirty(() =>
                setOutline((prev) => ({ ...prev, approach: e.target.value })),
              )
            }
            placeholder="结构思路 / approach"
          />
          <ul className="max-h-[28rem] space-y-2 overflow-auto">
            {outline.sections.length === 0 ? (
              <li className="text-xs text-neutral-500">
                还没有章节。回 Idea 用「AI 生成结构」采用方案，或下方新增章节。
              </li>
            ) : (
              outline.sections.map((section, index) => (
                <li
                  key={section.id}
                  className="rounded border border-neutral-200 bg-white p-2 text-xs"
                >
                  <div className="mb-1 flex gap-1">
                    <button
                      type="button"
                      className="rounded border px-1"
                      onClick={() => moveSection(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded border px-1"
                      onClick={() => moveSection(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ml-auto text-red-700 underline"
                      onClick={() =>
                        markDirty(() =>
                          setOutline((prev) => ({
                            ...prev,
                            sections: prev.sections.filter((_, i) => i !== index),
                          })),
                        )
                      }
                    >
                      删除
                    </button>
                  </div>
                  <input
                    className="mb-1 w-full rounded border px-1 py-0.5 font-medium"
                    value={section.title}
                    onChange={(e) => updateSection(index, { title: e.target.value })}
                    placeholder="章节标题"
                  />
                  <textarea
                    className="w-full rounded border px-1 py-0.5"
                    rows={2}
                    value={section.purpose}
                    onChange={(e) =>
                      updateSection(index, { purpose: e.target.value })
                    }
                    placeholder="本章目的"
                  />
                  {section.fragmentIds.length > 0 ? (
                    <p className="mt-1 text-neutral-500">
                      素材：
                      {section.fragmentIds.map((id) => fragmentLabel(id)).join('；')}
                    </p>
                  ) : null}
                  {section.missingMaterial.length > 0 ? (
                    <p className="mt-1 text-amber-800">
                      待补：{section.missingMaterial.join('；')}
                    </p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
            onClick={() =>
              markDirty(() =>
                setOutline((prev) => ({
                  ...prev,
                  sections: [
                    ...prev.sections,
                    {
                      id: createId('sec'),
                      title: '新章节',
                      purpose: '',
                      fragmentIds: [],
                      missingMaterial: [],
                    },
                  ],
                })),
              )
            }
          >
            + 新增章节
          </button>
        </aside>

        <div className="min-w-0">
          <MarkdownEditor
            value={content}
            onChange={(value) => markDirty(() => setContent(value))}
          />
        </div>

        <div className="min-w-0">
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
