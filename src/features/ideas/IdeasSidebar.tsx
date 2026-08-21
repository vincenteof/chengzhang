import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useMemo, useRef, useState } from 'react'

import { IdeaNameForm } from '#/components/ui/IdeaNameForm'
import {
  IconBook,
  IconNote,
  IconPanelLeft,
  IconPlus,
  IconSettings,
} from '#/components/ui/icons'
import { ThemeToggle } from '#/components/ui/ThemeToggle'
import { IdeaSearchBubble } from '#/features/ideas/IdeaSearchBubble'
import { createIdeaFn } from '#/features/ideas/ideas.functions'
import type { IdeaListItem } from '#/modules/ideas/ideas.service'

export function IdeasSidebar({
  ideas,
  activeId,
  captureActive = false,
  collapsed = false,
  onToggle,
  onLogout,
}: {
  ideas: IdeaListItem[]
  activeId?: string
  captureActive?: boolean
  collapsed?: boolean
  onToggle?: () => void
  onLogout?: () => void
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const createIdea = useServerFn(createIdeaFn)
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finderOpen, setFinderOpen] = useState(false)
  const finderBtnRef = useRef<HTMLButtonElement>(null)
  const ideasActive = pathname.startsWith('/ideas')
  const settingsActive = pathname.startsWith('/settings')

  useEffect(() => {
    if (!collapsed) setFinderOpen(false)
  }, [collapsed])

  const listed = useMemo(
    () =>
      [...ideas].sort((a, b) => {
        const aLive = a.fragmentCount > 0 ? 1 : 0
        const bLive = b.fragmentCount > 0 ? 1 : 0
        return bLive - aLive
      }),
    [ideas],
  )

  return (
    <aside className={collapsed ? 'ideas-sidebar is-rail' : 'ideas-sidebar'}>
      <div className="ideas-sidebar-brand">
        <Link
          to="/"
          search={{ assignTo: undefined }}
          activeOptions={{ exact: true }}
          className={
            collapsed ? 'ideas-brand-mark' : 'brand-wordmark ideas-home'
          }
          title="成章"
        >
          {collapsed ? '章' : '成章'}
        </Link>
        {onToggle ? (
          <button
            type="button"
            className={collapsed ? 'ideas-icon-btn' : 'ideas-sidebar-add'}
            onClick={onToggle}
            aria-label={collapsed ? '展开边栏' : '收起边栏'}
            title={collapsed ? '展开边栏' : '收起边栏'}
          >
            <IconPanelLeft size={15} />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <nav className="ideas-rail-nav" aria-label="主导航">
          <Link
            to="/"
            search={{ assignTo: undefined }}
            activeOptions={{ exact: true }}
            className="ideas-icon-btn"
            data-active={captureActive ? 'true' : undefined}
            title="碎片"
            aria-label="碎片"
          >
            <IconNote size={16} />
          </Link>
          <button
            ref={finderBtnRef}
            type="button"
            className="ideas-icon-btn"
            data-active={ideasActive || finderOpen ? 'true' : undefined}
            title="想法"
            aria-label="想法"
            aria-expanded={finderOpen}
            aria-haspopup="dialog"
            onClick={() => setFinderOpen((open) => !open)}
          >
            <IconBook size={16} />
          </button>
        </nav>
      ) : (
        <Link
          to="/"
          search={{ assignTo: undefined }}
          activeOptions={{ exact: true }}
          className="ideas-nav-item ideas-nav-capture"
          data-active={captureActive ? 'true' : undefined}
          title="碎片"
        >
          <span className="ideas-nav-name">碎片</span>
          <span className="ideas-nav-meta">记下念头</span>
        </Link>
      )}

      {collapsed ? null : (
        <>
          <div className="ideas-sidebar-head">
            <p className="ideas-sidebar-title">想法</p>
            {!creating ? (
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
              {error ? (
                <p className="status status-error mt-2">{error}</p>
              ) : null}
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
        </>
      )}

      {collapsed ? (
        <div className="ideas-sidebar-foot">
          <Link
            to="/settings"
            className="ideas-icon-btn"
            data-active={settingsActive ? 'true' : undefined}
            title="设置"
            aria-label="设置"
          >
            <IconSettings size={16} />
          </Link>
        </div>
      ) : (
        <div className="ideas-sidebar-foot">
          <ThemeToggle />
          <Link to="/settings" className="ideas-foot-link">
            设置
          </Link>
          {onLogout ? (
            <button
              type="button"
              className="ideas-foot-link"
              onClick={onLogout}
            >
              退出
            </button>
          ) : null}
        </div>
      )}
      {collapsed && finderOpen && finderBtnRef.current ? (
        <IdeaSearchBubble
          ideas={listed}
          activeId={activeId}
          anchor={finderBtnRef.current}
          onClose={() => setFinderOpen(false)}
          onSelect={(idea) => {
            setFinderOpen(false)
            void navigate({
              to: '/ideas/$ideaId',
              params: { ideaId: idea.id },
              search: { mode: undefined },
            })
          }}
        />
      ) : null}
    </aside>
  )
}
