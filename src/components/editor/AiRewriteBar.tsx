import { useLayoutEffect, useRef, useState } from 'react'

import type { SelectionCoords } from './editor-types'

type Props = {
  coords: SelectionCoords | null
  summary?: string | null
  onAccept: () => void
  onReject: () => void
}

const GAP = 10
const EDGE = 8

/**
 * Compact accept/reject chrome near the rewritten range.
 * The diff itself lives in the editor; this bar stays out of the document.
 */
export function AiRewriteBar({ coords, summary, onAccept, onReject }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!coords || !ref.current) {
      setPos(null)
      return
    }
    const el = ref.current
    const apply = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w === 0) return
      const midX = (coords.left + coords.right) / 2
      let left = midX - w / 2
      left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE))
      let top = coords.top - h - GAP
      if (top < EDGE) top = coords.bottom + GAP
      top = Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE))
      setPos({ top, left })
    }
    apply()
    const id = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(id)
  }, [coords, summary])

  const fallback = { top: window.innerHeight - 88, left: 24 }

  return (
    <div
      ref={ref}
      className="selection-ai-bubble ai-rewrite-bar"
      role="toolbar"
      aria-label="选区 AI 建议"
      style={
        pos
          ? { top: pos.top, left: pos.left, opacity: 1 }
          : coords
            ? { top: -9999, left: -9999, opacity: 0 }
            : fallback
      }
      onPointerDown={(e) => e.preventDefault()}
    >
      {summary ? <p className="ai-rewrite-bar-summary">{summary}</p> : null}
      <div className="selection-ai-bubble-row">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onAccept}
        >
          接受并替换
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onReject}
        >
          拒绝
        </button>
      </div>
    </div>
  )
}
