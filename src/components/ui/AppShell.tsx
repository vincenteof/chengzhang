import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { ThemeToggle } from '#/components/ui/ThemeToggle'

type Props = {
  userLabel?: string
  onLogout?: () => void
  children: ReactNode
  wide?: boolean
  quiet?: boolean
  flush?: boolean
}

export function AppShell({
  userLabel,
  onLogout,
  children,
  wide,
  quiet,
  flush,
}: Props) {
  return (
    <div
      className={[
        'app-shell',
        quiet ? 'app-shell-quiet' : '',
        flush ? 'app-shell-flush' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="app-header">
        <div className="app-header-inner">
          <nav className="flex flex-wrap items-center gap-1">
            <Link
              to="/"
              search={{ assignTo: undefined }}
              className="brand-wordmark mr-2"
              activeOptions={{ exact: true }}
            >
              成章
            </Link>
            <Link
              to="/"
              search={{ assignTo: undefined }}
              className="cz-link-nav"
              activeOptions={{ exact: true }}
              activeProps={{ className: 'cz-link-nav active' }}
            >
              捕捉
            </Link>
            <Link
              to="/ideas"
              className="cz-link-nav"
              activeProps={{ className: 'cz-link-nav active' }}
            >
              想法
            </Link>
            <Link
              to="/settings"
              className="cz-link-nav"
              activeProps={{ className: 'cz-link-nav active' }}
            >
              设置
            </Link>
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {userLabel ? (
              <span
                className="meta hidden max-w-[14rem] truncate md:inline"
                title={userLabel}
              >
                {userLabel}
              </span>
            ) : null}
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                className="btn btn-secondary btn-sm"
              >
                退出
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main
        className={
          flush
            ? 'app-main app-main-flush'
            : wide
              ? 'app-main app-main-wide'
              : 'app-main'
        }
      >
        {children}
      </main>
    </div>
  )
}
