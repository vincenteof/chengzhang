import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'

import { DraftEditor } from '#/features/drafts/DraftEditor'
import { getDraftEditorContextFn } from '#/features/drafts/drafts.functions'
import type { DraftEditorContext } from '#/modules/drafts/drafts.service'

export function IdeaWritePane({ draftId }: { draftId: string }) {
  const loadContext = useServerFn(getDraftEditorContextFn)
  const [context, setContext] = useState<DraftEditorContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContext(null)
    setError(null)
    void loadContext({ data: { draftId } }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setContext(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [draftId, loadContext])

  if (error) {
    return (
      <div className="ideas-empty">
        <p className="ideas-empty-desc">{error}</p>
      </div>
    )
  }
  if (!context) {
    return (
      <div className="ideas-empty">
        <p className="ideas-empty-desc">正在打开编辑器…</p>
      </div>
    )
  }

  return <DraftEditor key={context.draft.id} context={context} embedded />
}
