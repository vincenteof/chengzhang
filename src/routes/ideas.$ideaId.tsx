import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import { createDraftFn } from '#/features/drafts/drafts.functions'
import { listFragmentsFn } from '#/features/fragments/fragments.functions'
import {
  addIdeaFragmentsFn,
  getIdeaWorkspaceFn,
  removeIdeaFragmentFn,
  updateIdeaFn,
} from '#/features/ideas/ideas.functions'

export const Route = createFileRoute('/ideas/$ideaId')({
  loader: async ({ params }) => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const [workspace, allFragments] = await Promise.all([
      getIdeaWorkspaceFn({ data: { ideaId: params.ideaId } }),
      listFragmentsFn({ data: {} }),
    ])
    if (!workspace.ok) {
      throw redirect({ to: '/ideas' })
    }
    return {
      user: session.data.user,
      workspace: workspace.data,
      allFragments: allFragments.ok ? allFragments.data : [],
    }
  },
  component: IdeaWorkspacePage,
})

function IdeaWorkspacePage() {
  const { user, workspace, allFragments } = Route.useLoaderData()
  const { idea, fragments, draft } = workspace
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const updateIdea = useServerFn(updateIdeaFn)
  const removeFragment = useServerFn(removeIdeaFragmentFn)
  const addFragments = useServerFn(addIdeaFragmentsFn)
  const createDraft = useServerFn(createDraftFn)
  const [status, setStatus] = useState<string | null>(null)
  const [claim, setClaim] = useState(idea.confirmedClaim ?? '')

  const available = allFragments.filter((f) => !f.ideaIds.includes(idea.id))

  return (
    <AppShell
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="mb-4 text-sm">
        <Link to="/ideas" className="text-blue-700 underline">
          ← Ideas
        </Link>
      </div>

      <h1 className="text-2xl font-semibold">{idea.name}</h1>
      {idea.description ? (
        <p className="mt-1 text-sm text-neutral-600">{idea.description}</p>
      ) : null}

      <section className="mt-6 rounded-lg border border-neutral-200 p-4">
        <h2 className="font-medium">写作方向（手动）</h2>
        <p className="mt-1 text-xs text-neutral-500">
          AI 候选主张在 Slice 2。现在可先自行写下中心主张。
        </p>
        <textarea
          className="mt-3 w-full rounded border border-neutral-300 p-2 text-sm"
          rows={3}
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          placeholder="作者希望读者相信什么？"
        />
        <button
          type="button"
          className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
          onClick={async () => {
            const result = await updateIdea({
              data: {
                id: idea.id,
                baseRevision: idea.revision,
                confirmedClaim: claim || null,
              },
            })
            if (!result.ok) {
              setStatus(result.error.message)
              return
            }
            setStatus('主张已保存')
            await router.invalidate()
          }}
        >
          保存主张
        </button>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">素材（{fragments.length}）</h2>
          <button
            type="button"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
            onClick={async () => {
              const result = await createDraft({
                data: { ideaId: idea.id, title: idea.name },
              })
              if (!result.ok) {
                setStatus(result.error.message)
                return
              }
              await navigate({
                to: '/drafts/$draftId',
                params: { draftId: result.data.id },
              })
            }}
          >
            {draft ? '打开草稿' : '创建草稿工作副本'}
          </button>
        </div>

        <ul className="mt-3 space-y-2">
          {fragments.length === 0 ? (
            <li className="text-sm text-neutral-500">还没有素材，从下方加入碎片。</li>
          ) : (
            fragments.map((fragment) => (
              <li
                key={fragment.id}
                className="rounded border border-neutral-200 p-3 text-sm"
              >
                <p className="whitespace-pre-wrap">{fragment.content}</p>
                <button
                  type="button"
                  className="mt-2 text-xs text-red-700 underline"
                  onClick={async () => {
                    if (!window.confirm('从当前 Idea 移出该碎片？（不删除碎片本身）')) {
                      return
                    }
                    const result = await removeFragment({
                      data: {
                        ideaId: idea.id,
                        fragmentId: fragment.id,
                      },
                    })
                    if (!result.ok) {
                      setStatus(result.error.message)
                      return
                    }
                    setStatus('已移出；若已有 AI 结果，稍后重新生成可能更准确。')
                    await router.invalidate()
                  }}
                >
                  移出
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-medium">加入更多碎片</h2>
        <ul className="mt-3 max-h-80 space-y-2 overflow-auto">
          {available.length === 0 ? (
            <li className="text-sm text-neutral-500">
              没有可加入的碎片。去{' '}
              <Link to="/" className="text-blue-700 underline">
                捕捉
              </Link>{' '}
              先记几条。
            </li>
          ) : (
            available.map((fragment) => (
              <li
                key={fragment.id}
                className="flex items-start justify-between gap-3 rounded border border-neutral-100 p-2 text-sm"
              >
                <p className="whitespace-pre-wrap text-neutral-700">
                  {fragment.content.slice(0, 160)}
                  {fragment.content.length > 160 ? '…' : ''}
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded border px-2 py-1 text-xs"
                  onClick={async () => {
                    const result = await addFragments({
                      data: {
                        ideaId: idea.id,
                        fragmentIds: [fragment.id],
                      },
                    })
                    if (!result.ok) {
                      setStatus(result.error.message)
                      return
                    }
                    await router.invalidate()
                  }}
                >
                  加入
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {status ? (
        <p className="mt-4 text-sm text-neutral-600" role="status">
          {status}
        </p>
      ) : null}
    </AppShell>
  )
}
