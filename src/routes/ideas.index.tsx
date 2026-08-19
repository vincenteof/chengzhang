import {
  Link,
  createFileRoute,
  redirect,
  useHydrated,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { AppShell } from '#/components/ui/AppShell'
import { IdeaNameForm } from '#/components/ui/IdeaNameForm'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import {
  createIdeaFn,
  deleteIdeaFn,
  listIdeasFn,
  previewDeleteIdeaFn,
  updateIdeaFn,
} from '#/features/ideas/ideas.functions'

export const Route = createFileRoute('/ideas/')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const ideas = await listIdeasFn()
    return {
      user: session.data.user,
      ideas: ideas.ok ? ideas.data : [],
      error: ideas.ok ? null : ideas.error.message,
    }
  },
  component: IdeasPage,
})

function IdeasPage() {
  const { user, ideas, error } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const createIdea = useServerFn(createIdeaFn)
  const updateIdea = useServerFn(updateIdeaFn)
  const previewDelete = useServerFn(previewDeleteIdeaFn)
  const deleteIdea = useServerFn(deleteIdeaFn)
  const hydrated = useHydrated()
  const [creating, setCreating] = useState(false)
  const [createPending, setCreatePending] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamePending, setRenamePending] = useState(false)
  const [status, setStatus] = useState<string | null>(error)
  const showCreate = creating || ideas.length === 0
  const listed = [...ideas].sort((a, b) => {
    const aLive = a.fragmentCount > 0 ? 1 : 0
    const bLive = b.fragmentCount > 0 ? 1 : 0
    return bLive - aLive
  })

  async function removeIdea(idea: (typeof ideas)[number]) {
    const preview = await previewDelete({
      data: { ideaId: idea.id },
    })
    if (!preview.ok) {
      setStatus(preview.error.message)
      return
    }
    if (preview.data.requiresDeleteDraft) {
      const ok1 = window.confirm(
        `「${idea.name}」已有草稿「${preview.data.draft ? preview.data.draft.title : ''}」。继续将要求同时删除草稿。`,
      )
      if (!ok1) return
      const ok2 = window.confirm(
        '再次确认：同时删除想法与草稿？碎片本身会保留。',
      )
      if (!ok2) return
      const result = await deleteIdea({
        data: { ideaId: idea.id, deleteDraft: true },
      })
      if (!result.ok) {
        setStatus(result.error.message)
        return
      }
    } else {
      if (!window.confirm(`删除想法「${idea.name}」？碎片本身会保留。`)) {
        return
      }
      const result = await deleteIdea({
        data: { ideaId: idea.id },
      })
      if (!result.ok) {
        setStatus(result.error.message)
        return
      }
    }
    await router.invalidate()
  }

  return (
    <AppShell
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">想法</h1>
          <p className="page-desc">
            从捕捉收来的一组念头。打开继续长，或回去补素材。
          </p>
        </div>
        {ideas.length > 0 && !showCreate ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCreating(true)}
          >
            新想法
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <div className="mt-6">
          <IdeaNameForm
            title="新想法"
            hint="也可以从捕捉勾选碎片后直接开一篇。"
            submitLabel="创建"
            pending={!hydrated || createPending}
            onCancel={ideas.length === 0 ? undefined : () => setCreating(false)}
            onSubmit={async ({ name, description }) => {
              setCreatePending(true)
              try {
                const result = await createIdea({
                  data: { name, description },
                })
                if (!result.ok) {
                  setStatus(result.error.message)
                  return
                }
                setCreating(false)
                await navigate({
                  to: '/ideas/$ideaId',
                  params: { ideaId: result.data.id },
                })
              } finally {
                setCreatePending(false)
              }
            }}
          />
        </div>
      ) : null}

      {status ? (
        <p className="status mt-3" role="status">
          {status}
        </p>
      ) : null}

      {listed.length === 0 ? null : (
        <ul className="mt-8 space-y-3">
          {listed.map((idea) => (
            <li key={idea.id} className="list-row">
              {renamingId === idea.id ? (
                <IdeaNameForm
                  title="重命名"
                  submitLabel="保存"
                  initialName={idea.name}
                  initialDescription={idea.description}
                  pending={renamePending}
                  onCancel={() => setRenamingId(null)}
                  onSubmit={async ({ name, description }) => {
                    setRenamePending(true)
                    try {
                      const result = await updateIdea({
                        data: {
                          id: idea.id,
                          baseRevision: idea.revision,
                          name,
                          description,
                        },
                      })
                      if (!result.ok) {
                        setStatus(result.error.message)
                        return
                      }
                      setRenamingId(null)
                      await router.invalidate()
                    } finally {
                      setRenamePending(false)
                    }
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/ideas/$ideaId"
                      params={{ ideaId: idea.id }}
                      className="font-display text-lg font-semibold tracking-tight text-[var(--cz-ink)] hover:text-[var(--cz-seal)]"
                    >
                      {idea.name}
                    </Link>
                    {idea.description ? (
                      <p className="muted mt-1 text-sm">{idea.description}</p>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="badge">{idea.fragmentCount} 条碎片</span>
                      {idea.hasDraft ? (
                        <span className="badge badge-moss">有草稿</span>
                      ) : null}
                      <span className="meta">
                        更新于 {new Date(idea.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {idea.draftId ? (
                      <Link
                        to="/drafts/$draftId"
                        params={{ draftId: idea.draftId }}
                        search={{ compose: false }}
                        className="btn btn-primary btn-sm"
                      >
                        继续写
                      </Link>
                    ) : (
                      <Link
                        to="/ideas/$ideaId"
                        params={{ ideaId: idea.id }}
                        className="btn btn-primary btn-sm"
                      >
                        打开
                      </Link>
                    )}
                    <details className="editor-more">
                      <summary className="btn btn-ghost btn-sm">更多</summary>
                      <div className="editor-more-menu" role="menu">
                        {idea.draftId ? (
                          <Link
                            to="/ideas/$ideaId"
                            params={{ ideaId: idea.id }}
                            className="editor-more-item"
                            role="menuitem"
                          >
                            看素材
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="editor-more-item"
                          role="menuitem"
                          onClick={() => setRenamingId(idea.id)}
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          className="editor-more-item text-[var(--cz-danger)]"
                          role="menuitem"
                          onClick={() => void removeIdea(idea)}
                        >
                          删除
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}
