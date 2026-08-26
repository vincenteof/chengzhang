import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMemo, useRef, useState } from 'react'

import { BtnBusy } from '#/components/ui/BtnBusy'
import { IdeaNameForm } from '#/components/ui/IdeaNameForm'
import { WorkspaceShell } from '#/components/ui/WorkspaceShell'
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
  removeIdeaFragmentFn,
} from '#/features/ideas/ideas.functions'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    assignTo: typeof search.assignTo === 'string' ? search.assignTo : undefined,
  }),
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
        !fragments.ok || !ideas.ok ? '部分数据加载失败，可刷新重试' : null,
    }
  },
  component: CapturePage,
})

function CapturePage() {
  const {
    fragments: initialFragments,
    ideas,
    loadError,
  } = Route.useLoaderData()
  const { assignTo } = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const createFragment = useServerFn(createFragmentFn)
  const updateFragment = useServerFn(updateFragmentFn)
  const deleteFragment = useServerFn(deleteFragmentFn)
  const previewDelete = useServerFn(previewDeleteFragmentFn)
  const createIdea = useServerFn(createIdeaFn)
  const addToIdea = useServerFn(addIdeaFragmentsFn)
  const removeFromIdea = useServerFn(removeIdeaFragmentFn)

  const {
    text,
    captureRequestId,
    hydrated,
    updateText,
    ensureRequestId,
    clearAfterSuccess,
  } = useCaptureDraft()

  const assignIdea = useMemo(
    () => ideas.find((i) => i.id === assignTo) ?? null,
    [ideas, assignTo],
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [filter, setFilter] = useState<'all' | 'unassigned'>(() =>
    assignTo ? 'unassigned' : 'all',
  )
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [gatherOpen, setGatherOpen] = useState(false)
  const [gatherPending, setGatherPending] = useState(false)

  const fragments = useMemo(() => {
    if (filter === 'unassigned') {
      return initialFragments.filter((f) => f.ideaIds.length === 0)
    }
    return initialFragments
  }, [filter, initialFragments])

  const hintExtras = [
    text.trim() ? '未提交内容已本地暂存' : null,
    assignIdea ? `将归入「${assignIdea.name}」` : null,
  ].filter(Boolean)

  async function refresh() {
    await router.invalidate()
  }

  async function submitCapture() {
    const content = text.trim()
    if (!content || saving) return
    setSaving(true)
    const requestId = ensureRequestId()
    try {
      const result = await createFragment({
        data: {
          content,
          captureRequestId: requestId || captureRequestId,
          // When picking for an idea, new notes go straight into it.
          ...(assignIdea ? { ideaId: assignIdea.id } : {}),
        },
      })
      if (!result.ok) {
        setStatus(`${result.error.message}（内容已保留，可重试）`)
        return
      }
      clearAfterSuccess()
      setStatus(assignIdea ? `已保存并归入「${assignIdea.name}」` : '已保存')
      // Drop the busy chrome before list refresh — on mobile the spinner
      // layer was lingering next to the now-empty disabled button.
      setSaving(false)
      await refresh()
      textareaRef.current?.focus()
    } catch {
      setStatus('网络失败，内容已保留，可重试')
    } finally {
      setSaving(false)
    }
  }

  async function assignSelectedToIdea(ideaId: string, ideaName: string) {
    const result = await addToIdea({
      data: { ideaId, fragmentIds: [...selected] },
    })
    if (!result.ok) {
      setStatus(result.error.message)
      return
    }
    setSelected(new Set())
    setStatus(`已加入「${ideaName}」`)
    await refresh()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      e.keyCode !== 229
    ) {
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
    <WorkspaceShell
      ideas={ideas}
      captureActive
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <section>
        <h1 className="page-title">碎片</h1>
        <p className="page-desc">
          记下不想失去的念头。几条在谈同一件事时，勾选后问自己：这是一篇吗？
        </p>

        {assignIdea ? (
          <div className="callout callout-info mt-4">
            <p className="font-medium">
              正在为想法「{assignIdea.name}」挑选碎片
            </p>
            <p className="muted mt-1 text-sm">
              上方新写的会直接归入该想法；下方可勾选未归属碎片后一键加入。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                to="/ideas/$ideaId"
                params={{ ideaId: assignIdea.id }}
                className="btn btn-secondary btn-xs"
              >
                回到想法
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() =>
                  void navigate({ to: '/', search: { assignTo: undefined } })
                }
              >
                退出挑选
              </button>
            </div>
          </div>
        ) : null}

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
            {hintExtras.length > 0 ? (
              <p className="meta capture-hint">
                <span className="capture-hint-extras">
                  {hintExtras.join(' · ')}
                </span>
              </p>
            ) : null}
            <button
              type="button"
              disabled={saving || !text.trim()}
              aria-busy={saving}
              onClick={() => void submitCapture()}
              className="btn btn-primary"
            >
              <BtnBusy busy={saving}>
                {assignIdea ? '保存到该想法' : '保存碎片'}
              </BtnBusy>
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
        {loadError ? (
          <p className="status status-warn mt-2">{loadError}</p>
        ) : null}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">碎片</h2>
            <p className="meta mt-0.5">
              {filter === 'unassigned'
                ? `未归属 ${fragments.length} 条`
                : `共 ${fragments.length} 条`}
              {selected.size === 0 && fragments.length > 0
                ? ' · 勾选几条，问是不是一篇'
                : ''}
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
          <div className="mt-4 space-y-3">
            {gatherOpen && !assignIdea ? (
              <IdeaNameForm
                title={
                  selected.size === 1 ? '用这条开一篇' : '这几条是一篇吗？'
                }
                hint={`将用已选 ${selected.size} 条碎片开一个想法，然后打开它。`}
                submitLabel="开这篇"
                pending={gatherPending}
                onCancel={() => setGatherOpen(false)}
                onSubmit={async ({ name, description }) => {
                  setGatherPending(true)
                  try {
                    const result = await createIdea({
                      data: {
                        name,
                        description,
                        fragmentIds: [...selected],
                      },
                    })
                    if (!result.ok) {
                      setStatus(result.error.message)
                      return
                    }
                    setSelected(new Set())
                    setGatherOpen(false)
                    await navigate({
                      to: '/ideas/$ideaId',
                      params: { ideaId: result.data.id },
                    })
                  } catch {
                    setStatus('创建失败，可重试')
                  } finally {
                    setGatherPending(false)
                  }
                }}
              />
            ) : (
              <div className="toolbar">
                <span className="badge badge-seal">已选 {selected.size}</span>
                {assignIdea ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      void assignSelectedToIdea(assignIdea.id, assignIdea.name)
                    }
                  >
                    加入「{assignIdea.name}」
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setGatherOpen(true)}
                  >
                    {selected.size === 1 ? '用这条开一篇' : '这几条是一篇吗？'}
                  </button>
                )}
                {!assignIdea && ideas.length > 0 ? (
                  <select
                    className="select max-w-xs text-sm"
                    defaultValue=""
                    aria-label="加入已有想法"
                    onChange={(e) => {
                      const ideaId = e.target.value
                      if (!ideaId) return
                      const idea = ideas.find((i) => i.id === ideaId)
                      e.target.value = ''
                      if (!idea) return
                      void assignSelectedToIdea(idea.id, idea.name)
                    }}
                  >
                    <option value="">加入已有想法…</option>
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
                  onClick={() => {
                    setGatherOpen(false)
                    setSelected(new Set())
                  }}
                >
                  取消选择
                </button>
              </div>
            )}
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
                      {fragment.ideaIds.length > 0 ? (
                        fragment.ideaIds.map((ideaId, i) => (
                          <span
                            key={ideaId}
                            className="badge inline-flex items-center gap-1"
                          >
                            <Link
                              to="/ideas/$ideaId"
                              params={{ ideaId }}
                              className="hover:opacity-80"
                            >
                              {fragment.ideaNames[i] || ideaId}
                            </Link>
                            <button
                              type="button"
                              className="ml-0.5 rounded px-0.5 text-[0.7rem] leading-none opacity-70 hover:bg-[var(--cz-line)] hover:opacity-100"
                              title={`从「${fragment.ideaNames[i] || '想法'}」移出（不删除碎片）`}
                              aria-label={`从${fragment.ideaNames[i] || '想法'}移出`}
                              onClick={async (e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const name = fragment.ideaNames[i] || '该想法'
                                if (
                                  !window.confirm(
                                    `从「${name}」移出这条碎片？碎片会留在捕捉里。`,
                                  )
                                ) {
                                  return
                                }
                                const result = await removeFromIdea({
                                  data: {
                                    ideaId,
                                    fragmentId: fragment.id,
                                  },
                                })
                                if (!result.ok) {
                                  setStatus(result.error.message)
                                  return
                                }
                                setStatus(`已从「${name}」移出`)
                                await refresh()
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))
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
                              ? `该碎片关联 ${preview.data.ideaCount} 个想法（${preview.data.ideas.map((i) => i.ideaName).join('、')}）。确定删除？`
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
            想法
          </Link>{' '}
          织成文章。
        </p>
      </section>
    </WorkspaceShell>
  )
}
