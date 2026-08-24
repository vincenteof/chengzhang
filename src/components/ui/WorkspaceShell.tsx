import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { IdeasSidebar } from '#/features/ideas/IdeasSidebar'
import type { IdeaListItem } from '#/modules/ideas/ideas.service'

const STORAGE_KEY = 'chengzhang:nav-collapsed'
const MOBILE_QUERY = '(max-width: 800px)'

function readCollapsed() {
  if (typeof localStorage === 'undefined') return true
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return true
  return stored === '1'
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_QUERY).matches
}

export function WorkspaceShell({
  ideas,
  activeIdeaId,
  captureActive = false,
  fill = false,
  onLogout,
  children,
}: {
  ideas: IdeaListItem[]
  activeIdeaId?: string
  captureActive?: boolean
  fill?: boolean
  onLogout?: () => void
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(true)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    function apply() {
      if (mq.matches) setCollapsed(true)
      else setCollapsed(readCollapsed())
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (isMobileViewport()) setCollapsed(true)
  }, [pathname])

  useEffect(() => {
    if (collapsed) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && isMobileViewport()) {
        setCollapsed(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      if (!isMobileViewport()) {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      }
      return next
    })
  }

  return (
    <div
      className={`app-shell app-shell-flush workspace-shell${collapsed ? ' is-collapsed' : ''}`}
    >
      <button
        type="button"
        className="workspace-nav-trigger ideas-brand-mark"
        aria-label="打开导航"
        title="打开导航"
        onClick={toggle}
      >
        章
      </button>
      <button
        type="button"
        className="workspace-nav-backdrop"
        aria-label="关闭导航"
        onClick={() => setCollapsed(true)}
      />
      <IdeasSidebar
        ideas={ideas}
        activeId={activeIdeaId}
        captureActive={captureActive}
        collapsed={collapsed}
        onToggle={toggle}
        onLogout={onLogout}
      />
      <div
        className={
          fill ? 'workspace-main workspace-main-fill' : 'workspace-main'
        }
      >
        {fill ? (
          children
        ) : (
          <div className="workspace-main-scroll">
            <div className="workspace-main-inner">{children}</div>
          </div>
        )}
      </div>
    </div>
  )
}
