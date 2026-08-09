import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { AppShell } from '#/components/ui/AppShell'
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string | null>(error)

  return (
    <AppShell
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <p className="section-kicker">工作台</p>
      <h1 className="page-title mt-1">想法</h1>
      <p className="page-desc">正在生长的线索——从素材到主张，再到成文。</p>

      <form
        className="panel mt-8 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const result = await createIdea({
            data: {
              name,
              description: description || null,
            },
          })
          if (!result.ok) {
            setStatus(result.error.message)
            return
          }
          setName('')
          setDescription('')
          setStatus(`已创建 ${result.data.name}`)
          await router.invalidate()
        }}
      >
        <div>
          <p className="section-kicker">新建</p>
          <h2 className="section-title mt-1">新建想法</h2>
        </div>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名称（必填）"
          className="input"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="一句话说明（可选）"
          className="input"
        />
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary">
            创建
          </button>
        </div>
      </form>

      {status ? (
        <p className="status mt-3" role="status">
          {status}
        </p>
      ) : null}

      <ul className="mt-10 space-y-3">
        {ideas.length === 0 ? (
          <li className="empty">还没有想法。从捕捉页选几条碎片，或在上方新建。</li>
        ) : (
          ideas.map((idea) => (
            <li key={idea.id} className="list-row">
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
                    ) : (
                      <span className="badge">无草稿</span>
                    )}
                    <span className="meta">
                      更新于 {new Date(idea.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    to="/ideas/$ideaId"
                    params={{ ideaId: idea.id }}
                    className="btn btn-secondary btn-sm"
                  >
                    打开
                  </Link>
                  {idea.draftId ? (
                    <Link
                      to="/drafts/$draftId"
                      params={{ draftId: idea.draftId }}
                      className="btn btn-secondary btn-sm"
                    >
                      草稿
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      const next = window.prompt('重命名想法', idea.name)
                      if (!next?.trim() || next.trim() === idea.name) return
                      const result = await updateIdea({
                        data: {
                          id: idea.id,
                          baseRevision: idea.revision,
                          name: next.trim(),
                        },
                      })
                      if (!result.ok) {
                        setStatus(result.error.message)
                        return
                      }
                      await router.invalidate()
                    }}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
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
                        if (
                          !window.confirm(
                            `删除想法「${idea.name}」？碎片本身会保留。`,
                          )
                        ) {
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
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </AppShell>
  )
}
