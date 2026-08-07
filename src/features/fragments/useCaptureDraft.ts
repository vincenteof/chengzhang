import { useCallback, useEffect, useState } from 'react'

import { createId } from '#/shared/ids'

const STORAGE_KEY = 'chengzhang.capture.draft.v1'

type CaptureDraft = {
  text: string
  captureRequestId: string
}

function readDraft(): CaptureDraft {
  if (typeof window === 'undefined') {
    return { text: '', captureRequestId: createId('cap') }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { text: '', captureRequestId: createId('cap') }
    const parsed = JSON.parse(raw) as CaptureDraft
    if (typeof parsed.text === 'string' && typeof parsed.captureRequestId === 'string') {
      return parsed
    }
  } catch {
    // ignore
  }
  return { text: '', captureRequestId: createId('cap') }
}

function writeDraft(draft: CaptureDraft) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
}

function clearDraftStorage() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

export function useCaptureDraft() {
  const [text, setText] = useState('')
  const [captureRequestId, setCaptureRequestId] = useState(() => createId('cap'))
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const draft = readDraft()
    setText(draft.text)
    setCaptureRequestId(draft.captureRequestId || createId('cap'))
    setHydrated(true)
  }, [])

  const updateText = useCallback(
    (next: string) => {
      setText(next)
      writeDraft({ text: next, captureRequestId })
    },
    [captureRequestId],
  )

  const ensureRequestId = useCallback(() => {
    if (captureRequestId) return captureRequestId
    const id = createId('cap')
    setCaptureRequestId(id)
    writeDraft({ text, captureRequestId: id })
    return id
  }, [captureRequestId, text])

  const clearAfterSuccess = useCallback(() => {
    const nextId = createId('cap')
    setText('')
    setCaptureRequestId(nextId)
    clearDraftStorage()
    writeDraft({ text: '', captureRequestId: nextId })
  }, [])

  return {
    text,
    captureRequestId,
    hydrated,
    updateText,
    ensureRequestId,
    clearAfterSuccess,
  }
}
