import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMemo, useRef, useState } from 'react'

import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import {
  createFragmentFn,
  deleteFragmentFn,
  listFragmentsFn,
  previewDeleteFragmentFn,
  updateFragmentFn,
} from '#/features/fragments/fragments.functions'
import { useCaptureDraft } from '#/features/fragments/useCaptureDraft'
import {
  addIdeaFragmentsFn,
  createIdeaFn,
  listIdeasFn,
} from '#/features/ideas/ideas.functions'

export const Route = createFileRoute('/')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const [fragments, ideas] = await Promise.all([
      listFragmentsFn({ data: {} }),
      listIdeasFn(),
    ])
    return {
      user: session.data.user,
      fragments: fragments.ok ? fragments.data : [],
      ideas: ideas.ok ? ideas.data : [],
      loadError:
        !fragments.ok || !ideas.ok
          ? '部分数据加载失败，可刷新重试'
          : null,
    }
  },
  component: CapturePage,
})

function CapturePage() {
  const { user, fragments: initialFragments, ideas, loadError } =
    Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const createFragment = useServerFn(createFragmentFn)
  const updateFragment = useServerFn(updateFragmentFn)
  const deleteFragment = useServerFn(deleteFragmentFn)
  const previewDelete = useServerFn(previewDeleteFragmentFn)
  const createIdea = useServerFn(createIdeaFn)
  const addToIdea = useServerFn(addIdeaFragmentsFn)

  const {
    text,
    captureRequestId,
    hydrated,
    updateText,
    ensureRequestId,
    clearAfterSuccess,
  } = useCaptureDraft()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [filter, setFilter] = useState<'all' | 'unassigned'>('all')
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const fragments = useMemo(() => {
    if (filter === 'unassigned') {
      return initialFragments.filter((f) => f.ideaIds.length === 0)
    }
    return initialFragments
  }, [filter, initialFragments])

  async function refresh() {
    await router.invalidate()
  }

  async function submitCapture() {
    const content = text.trim()
    if (!content || saving) return
    setSaving(true)
    setStatus('保存中…')
    const requestId = ensureRequestId()
    try {
      const result = await createFragment({
        data: { content, captureRequestId: requestId || captureRequestId },
      })
      if (!result.ok) {
        setStatus(`${result.error.message}（内容已保留，可重试）`)
        return
      }
      clearAfterSuccess()
      setStatus('已保存')
      await refresh()
      textareaRef.current?.focus()
    } catch {
      setStatus('网络失败，内容已保留，可重试')
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submitCapture()
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <AppShell
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">捕捉</h1>
        <p className="mt-1 text-sm text-neutral-600">
          记下不想失去的念头。不必分类。
        </p>

        <div className="mt-4">
          <label className="sr-only" htmlFor="capture-input">
            快速输入
          </label>
          <textarea
            id="capture-input"
            ref={textareaRef}
            autoFocus
            value={hydrated ? text : ''}
            onChange={(e) => updateText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={5}
            placeholder="一段判断、一个比喻、一个例子…"
            className="w-full rounded-lg border border-neutral-300 p-3 text-base leading-relaxed outline-none ring-neutral-900 focus:ring-2"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">
              ⌘/Ctrl + Enter 提交 · Enter 换行
              {text.trim() ? ' · 未提交内容已本地暂存' : ''}
            </p>
            <button
              type="button"
              disabled={saving || !text.trim()}
              onClick={() => void submitCapture()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存碎片'}
            </button>
          </div>
          {status ? (
            <p className="mt-2 text-sm text-neutral-600" role="status">
              {status}
            </p>
          ) : null}
          {loadError ? (
            <p className="mt-2 text-sm text-amber-700">{loadError}</p>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">碎片 Inbox</h2>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className={`rounded px-2 py-1 ${filter === 'all' ? 'bg-neutral-900 text-white' : 'border border-neutral-300'}`}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${filter === 'unassigned' ? 'bg-neutral-900 text-white' : 'border border-neutral-300'}`}
              onClick={() => setFilter('unassigned')}
            >
              未归属
            </button>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <span>已选 {selected.size} 条</span>
            <button
              type="button"
              className="rounded border border-neutral-300 bg-white px-2 py-1"
              onClick={async () => {
                const name = window.prompt('新 Idea 名称')
                if (!name?.trim()) return
                const result = await createIdea({
                  data: {
                    name: name.trim(),
                    fragmentIds: [...selected],
                  },
                })
                if (!result.ok) {
                  setStatus(result.error.message)
                  return
                }
                setSelected(new Set())
                setStatus(`已创建 Idea：${result.data.name}`)
                await refresh()
              }}
            >
              创建 Idea 并加入
            </button>
            {ideas.length > 0 ? (
              <select
                className="rounded border border-neutral-300 bg-white px-2 py-1"
                defaultValue=""
                onChange={async (e) => {
                  const ideaId = e.target.value
                  if (!ideaId) return
                  const result = await addToIdea({
                    data: { ideaId, fragmentIds: [...selected] },
                  })
                  e.target.value = ''
                  if (!result.ok) {
                    setStatus(result.error.message)
                    return
                  }
                  setSelected(new Set())
                  setStatus('已加入 Idea')
                  await refresh()
                }}
              >
                <option value="">加入已有 Idea…</option>
                {ideas.map((idea) => (
                  <option key={idea.id} value={idea.id}>
                    {idea.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="text-neutral-500 underline"
              onClick={() => setSelected(new Set())}
            >
              取消选择
            </button>
          </div>
        ) : null}

        <ul className="mt-4 space-y-3">
          {fragments.length === 0 ? (
            <li className="text-sm text-neutral-500">还没有碎片。先写下第一条吧。</li>
          ) : (
            fragments.map((fragment) => (
              <li
                key={fragment.id}
                className="rounded-lg border border-neutral-200 p-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(fragment.id)}
                    onChange={() => toggleSelect(fragment.id)}
                    aria-label="选择碎片"
                  />
                  <div className="min-w-0 flex-1">
                    {editingId === fragment.id ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full rounded border border-neutral-300 p-2 text-sm"
                          rows={4}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                            onClick={async () => {
                              const result = await updateFragment({
                                data: {
                                  id: fragment.id,
                                  content: editText,
                                  baseRevision: fragment.revision,
                                },
                              })
                              if (!result.ok) {
                                setStatus(result.error.message)
                                return
                              }
                              setEditingId(null)
                              await refresh()
                            }}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {fragment.content}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      <time dateTime={fragment.createdAt}>
                        {new Date(fragment.createdAt).toLocaleString()}
                      </time>
                      {fragment.ideaNames.length > 0 ? (
                        <span>Idea：{fragment.ideaNames.join('、')}</span>
                      ) : (
                        <span>未归属</span>
                      )}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          setEditingId(fragment.id)
                          setEditText(fragment.content)
                        }}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="underline text-red-700"
                        onClick={async () => {
                          const preview = await previewDelete({
                            data: { id: fragment.id },
                          })
                          if (!preview.ok) {
                            setStatus(preview.error.message)
                            return
                          }
                          const msg =
                            preview.data.ideaCount > 0
                              ? `该碎片关联 ${preview.data.ideaCount} 个 Idea（${preview.data.ideas.map((i) => i.ideaName).join('、')}）。确定删除？`
                              : '确定删除这条碎片？'
                          if (!window.confirm(msg)) return
                          const result = await deleteFragment({
                            data: { id: fragment.id },
                          })
                          if (!result.ok) {
                            setStatus(result.error.message)
                            return
                          }
                          await refresh()
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        <p className="mt-6 text-sm text-neutral-500">
          去{' '}
          <Link to="/ideas" className="text-blue-700 underline">
            Ideas
          </Link>{' '}
          继续组织素材。
        </p>
      </section>
    </AppShell>
  )
}
