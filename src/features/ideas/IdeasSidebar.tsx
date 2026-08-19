import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { IdeaNameForm } from '#/components/ui/IdeaNameForm'
import { IconPlus } from '#/components/ui/icons'
import { createIdeaFn } from '#/features/ideas/ideas.functions'
import type { IdeaListItem } from '#/modules/ideas/ideas.service'

export function IdeasSidebar({
  ideas,
  activeId,
}: {
  ideas: IdeaListItem[]
  activeId?: string
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const createIdea = useServerFn(createIdeaFn)
  const [creating, setCreating] = useState(ideas.length === 0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listed = [...ideas].sort((a, b) => {
    const aLive = a.fragmentCount > 0 ? 1 : 0
    const bLive = b.fragmentCount > 0 ? 1 : 0
    return bLive - aLive
  })

  return (
    <aside className="ideas-sidebar">
      <div className="ideas-sidebar-head">
        <p className="ideas-sidebar-title">想法</p>
        {listed.length > 0 && !creating ? (
          <button
            type="button"
            className="ideas-sidebar-add"
            onClick={() => setCreating(true)}
            aria-label="新想法"
          >
            <IconPlus size={15} />
          </button>
        ) : null}
      </div>
      {creating ? (
        <div className="ideas-sidebar-form">
          <IdeaNameForm
            title="新想法"
            submitLabel="创建"
            pending={pending}
            onCancel={
              listed.length === 0 ? undefined : () => setCreating(false)
            }
            onSubmit={async ({ name, description }) => {
              setPending(true)
              setError(null)
              try {
                const result = await createIdea({
                  data: { name, description },
                })
                if (!result.ok) {
                  setError(result.error.message)
                  return
                }
                setCreating(false)
                await router.invalidate()
                await navigate({
                  to: '/ideas/$ideaId',
                  params: { ideaId: result.data.id },
                  search: { mode: undefined },
                })
              } finally {
                setPending(false)
              }
            }}
          />
          {error ? <p className="status status-error mt-2">{error}</p> : null}
        </div>
      ) : null}
      <nav className="ideas-sidebar-list" aria-label="想法列表">
        {listed.length === 0 && !creating ? (
          <p className="meta px-2 py-3">还没有想法。</p>
        ) : (
          listed.map((idea) => (
            <Link
              key={idea.id}
              to="/ideas/$ideaId"
              params={{ ideaId: idea.id }}
              search={{ mode: undefined }}
              className="ideas-nav-item"
              data-active={idea.id === activeId ? 'true' : undefined}
            >
              <span className="ideas-nav-name">{idea.name}</span>
              <span className="ideas-nav-meta">
                {idea.fragmentCount} 条碎片
                {idea.hasDraft ? ' · 有正文' : ''}
              </span>
            </Link>
          ))
        )}
      </nav>
    </aside>
  )
}
