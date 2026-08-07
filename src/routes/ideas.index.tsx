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
      <h1 className="text-2xl font-semibold">Ideas</h1>
      <p className="mt-1 text-sm text-neutral-600">正在生长的想法。</p>

      <form
        className="mt-6 space-y-3 rounded-lg border border-neutral-200 p-4"
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
        <h2 className="font-medium">新建 Idea</h2>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名称（必填）"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="一句话说明（可选）"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          创建
        </button>
      </form>

      {status ? (
        <p className="mt-3 text-sm text-neutral-600" role="status">
          {status}
        </p>
      ) : null}

      <ul className="mt-8 space-y-3">
        {ideas.length === 0 ? (
          <li className="text-sm text-neutral-500">还没有 Idea。</li>
        ) : (
          ideas.map((idea) => (
            <li
              key={idea.id}
              className="rounded-lg border border-neutral-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    to="/ideas/$ideaId"
                    params={{ ideaId: idea.id }}
                    className="text-lg font-medium text-blue-800 underline-offset-2 hover:underline"
                  >
                    {idea.name}
                  </Link>
                  {idea.description ? (
                    <p className="mt-1 text-sm text-neutral-600">{idea.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-neutral-500">
                    {idea.fragmentCount} 条碎片
                    {idea.hasDraft ? ' · 有草稿' : ''}
                    {' · '}
                    更新于 {new Date(idea.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Link
                    to="/ideas/$ideaId"
                    params={{ ideaId: idea.id }}
                    className="rounded border border-neutral-300 px-2 py-1"
                  >
                    打开
                  </Link>
                  {idea.draftId ? (
                    <Link
                      to="/drafts/$draftId"
                      params={{ draftId: idea.draftId }}
                      className="rounded border border-neutral-300 px-2 py-1"
                    >
                      草稿
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={async () => {
                      const next = window.prompt('重命名 Idea', idea.name)
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
                    className="rounded border border-red-200 px-2 py-1 text-red-700"
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
                          `「${idea.name}」已有 Draft「${preview.data.draft ? preview.data.draft.title : ''}」。继续将要求同时删除 Draft。`,
                        )
                        if (!ok1) return
                        const ok2 = window.confirm(
                          '再次确认：同时删除 Idea 与 Draft？碎片本身会保留。',
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
                            `删除 Idea「${idea.name}」？碎片本身会保留。`,
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
