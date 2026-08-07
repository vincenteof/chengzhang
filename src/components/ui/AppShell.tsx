import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

type Props = {
  userLabel?: string
  onLogout?: () => void
  children: ReactNode
}

export function AppShell({ userLabel, onLogout, children }: Props) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              to="/"
              className="font-semibold text-neutral-900 [&.active]:underline"
              activeOptions={{ exact: true }}
            >
              成章
            </Link>
            <Link
              to="/"
              className="text-neutral-600 hover:text-neutral-900 [&.active]:text-neutral-900 [&.active]:underline"
              activeOptions={{ exact: true }}
            >
              捕捉
            </Link>
            <Link
              to="/ideas"
              className="text-neutral-600 hover:text-neutral-900 [&.active]:text-neutral-900 [&.active]:underline"
            >
              Ideas
            </Link>
          </nav>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {userLabel ? <span className="hidden sm:inline">{userLabel}</span> : null}
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                className="rounded border border-neutral-300 px-2 py-1 text-neutral-700 hover:bg-neutral-50"
              >
                退出
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  )
}
