import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { IdeasSidebar } from '#/features/ideas/IdeasSidebar'
import type { IdeaListItem } from '#/modules/ideas/ideas.service'

const STORAGE_KEY = 'chengzhang:nav-collapsed'

function readCollapsed() {
  if (typeof localStorage === 'undefined') return true
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return true
  return stored === '1'
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

  useEffect(() => {
    setCollapsed(readCollapsed())
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <div
      className={`app-shell app-shell-flush workspace-shell${collapsed ? ' is-collapsed' : ''}`}
    >
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
