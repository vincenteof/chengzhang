import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AppShell } from '#/components/ui/AppShell'
import { IdeasSidebar } from '#/features/ideas/IdeasSidebar'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import { listIdeasFn } from '#/features/ideas/ideas.functions'

export const Route = createFileRoute('/ideas')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const ideas = await listIdeasFn()
    return {
      user: session.data.user,
      ideas: ideas.ok ? ideas.data : [],
      loadError: ideas.ok ? null : ideas.error.message,
    }
  },
  component: IdeasLayout,
})

function IdeasLayout() {
  const { user, ideas, loadError } = Route.useLoaderData()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const params = useParams({ strict: false }) as { ideaId?: string }

  return (
    <AppShell
      flush
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="ideas-workspace">
        <IdeasSidebar ideas={ideas} activeId={params.ideaId} />
        <div className="ideas-detail">
          {loadError ? (
            <p className="status status-warn p-4">{loadError}</p>
          ) : null}
          <Outlet />
        </div>
      </div>
    </AppShell>
  )
}
