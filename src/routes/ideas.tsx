import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { WorkspaceShell } from '#/components/ui/WorkspaceShell'
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
  const { ideas, loadError } = Route.useLoaderData()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const params = useParams({ strict: false }) as { ideaId?: string }

  return (
    <WorkspaceShell
      fill
      ideas={ideas}
      activeIdeaId={params.ideaId}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="ideas-detail">
        {loadError ? (
          <p className="status status-warn p-4">{loadError}</p>
        ) : null}
        <Outlet />
      </div>
    </WorkspaceShell>
  )
}
