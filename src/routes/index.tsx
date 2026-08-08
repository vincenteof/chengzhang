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
        <p className="section-kicker">Inbox</p>
        <h1 className="page-title mt-1">捕捉</h1>
        <p className="page-desc">记下不想失去的念头。不必分类。</p>

        <div className="composer mt-6">
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
            className="textarea"
          />
          <div className="composer-footer">
            <p className="meta">
              ⌘/Ctrl + Enter 提交 · Enter 换行
              {text.trim() ? ' · 未提交内容已本地暂存' : ''}
            </p>
            <button
              type="button"
              disabled={saving || !text.trim()}
              onClick={() => void submitCapture()}
              className="btn btn-primary"
            >
              {saving ? '保存中…' : '保存碎片'}
            </button>
          </div>
        </div>

        {status ? (
          <p
            className={`status mt-3 ${status.includes('失败') || status.includes('网络') ? 'status-error' : status === '已保存' ? 'status-ok' : ''}`}
            role="status"
          >
            {status}
          </p>
        ) : null}
        {loadError ? <p className="status status-warn mt-2">{loadError}</p> : null}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">碎片</h2>
            <p className="meta mt-0.5">
              {filter === 'unassigned'
                ? `未归属 ${fragments.length} 条`
                : `共 ${fragments.length} 条`}
            </p>
          </div>
          <div className="seg" role="group" aria-label="筛选碎片">
            <button
              type="button"
              className="seg-item"
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            <button
              type="button"
              className="seg-item"
              aria-pressed={filter === 'unassigned'}
              onClick={() => setFilter('unassigned')}
            >
              未归属
            </button>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="toolbar mt-4">
            <span className="badge badge-seal">已选 {selected.size}</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
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
                className="select max-w-xs text-sm"
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
              className="btn btn-ghost btn-sm"
              onClick={() => setSelected(new Set())}
            >
              取消选择
            </button>
          </div>
        ) : null}

        <ul className="mt-4 space-y-3">
          {fragments.length === 0 ? (
            <li className="empty">
              还没有碎片。在上方写下一句判断、比喻或例子，即可开始。
            </li>
          ) : (
            fragments.map((fragment) => (
              <li key={fragment.id} className="list-row">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--cz-seal)]"
                    checked={selected.has(fragment.id)}
                    onChange={() => toggleSelect(fragment.id)}
                    aria-label="选择碎片"
                  />
                  <div className="min-w-0 flex-1">
                    {editingId === fragment.id ? (
                      <div className="space-y-2">
                        <textarea
                          className="textarea"
                          rows={4}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
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
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                        {fragment.content}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <time className="meta" dateTime={fragment.createdAt}>
                        {new Date(fragment.createdAt).toLocaleString()}
                      </time>
                      {fragment.ideaNames.length > 0 ? (
                        <span className="badge">{fragment.ideaNames.join(' · ')}</span>
                      ) : (
                        <span className="badge badge-amber">未归属</span>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          setEditingId(fragment.id)
                          setEditText(fragment.content)
                        }}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-[var(--cz-danger)]"
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

        <p className="meta mt-8">
          材料够了就去{' '}
          <Link to="/ideas" className="cz-link">
            Ideas
          </Link>{' '}
          织成文章。
        </p>
      </section>
    </AppShell>
  )
}
