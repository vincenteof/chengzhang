import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { DraftEditor } from '#/features/drafts/DraftEditor'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import { getDraftEditorContextFn } from '#/features/drafts/drafts.functions'

export const Route = createFileRoute('/drafts/$draftId')({
  validateSearch: (search: Record<string, unknown>) => ({
    compose:
      search.compose === true ||
      search.compose === '1' ||
      search.compose === 'true',
  }),
  loader: async ({ params }) => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const ctx = await getDraftEditorContextFn({
      data: { draftId: params.draftId },
    })
    if (!ctx.ok) {
      throw redirect({ to: '/ideas' })
    }
    return { user: session.data.user, context: ctx.data }
  },
  component: DraftEditorPage,
})

function DraftEditorPage() {
  const { user, context } = Route.useLoaderData()
  const { compose } = Route.useSearch()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)

  return (
    <DraftEditor
      context={context}
      composeRequested={compose}
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    />
  )
}
