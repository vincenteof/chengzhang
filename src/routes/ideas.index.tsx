import { Navigate, createFileRoute, getRouteApi } from '@tanstack/react-router'

const ideasRoute = getRouteApi('/ideas')

export const Route = createFileRoute('/ideas/')({
  component: IdeasIndexPage,
})

function IdeasIndexPage() {
  const { ideas } = ideasRoute.useLoaderData()
  const listed = [...ideas].sort((a, b) => {
    const aLive = a.fragmentCount > 0 ? 1 : 0
    const bLive = b.fragmentCount > 0 ? 1 : 0
    return bLive - aLive
  })
  const first = listed.find((i) => i.fragmentCount > 0) ?? listed[0]
  if (first) {
    return (
      <Navigate
        to="/ideas/$ideaId"
        params={{ ideaId: first.id }}
        search={{ mode: undefined }}
      />
    )
  }
  return (
    <div className="ideas-empty">
      <p className="ideas-empty-title">从念头长成一篇</p>
      <p className="ideas-empty-desc">左侧新建，或回捕捉勾选几条碎片。</p>
    </div>
  )
}
