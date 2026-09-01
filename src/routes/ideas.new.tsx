import {
  createFileRoute,
  getRouteApi,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { IdeaNameForm } from '#/components/ui/IdeaNameForm'
import { createIdeaFn } from '#/features/ideas/ideas.functions'

const ideasRoute = getRouteApi('/ideas')

export const Route = createFileRoute('/ideas/new')({
  component: IdeaNewPage,
})

function IdeaNewPage() {
  const { ideas } = ideasRoute.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const createIdea = useServerFn(createIdeaFn)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    if (ideas.length > 0) {
      await navigate({ to: '/ideas' })
      return
    }
    await navigate({ to: '/', search: { assignTo: undefined } })
  }

  return (
    <div className="idea-new">
      <IdeaNameForm
        title="这篇叫什么"
        hint="先立一篇。碎片可以稍后补。"
        submitLabel="开始"
        pending={pending}
        onCancel={() => void cancel()}
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
        <p className="status status-error mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
