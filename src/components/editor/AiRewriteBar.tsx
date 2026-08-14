import { useLayoutEffect, useRef, useState } from 'react'

import { IconCheck, IconClose } from '#/components/ui/icons'

import type { SelectionCoords } from './editor-types'

type Props = {
  coords: SelectionCoords | null
  summary?: string | null
  formatOnly?: boolean
  onAccept: () => void
  onReject: () => void
}

const GAP = 10
const EDGE = 8

/**
 * Compact accept/reject chrome near the rewritten range.
 * The diff itself lives in the editor; this bar stays out of the document.
 */
export function AiRewriteBar({
  coords,
  summary,
  formatOnly,
  onAccept,
  onReject,
}: Props) {
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
  }, [coords, summary, formatOnly])

  const fallback = { top: window.innerHeight - 88, left: 24 }
  const hint = formatOnly ? '仅格式有改动' : summary?.trim() || '已生成建议'

  return (
    <div
      ref={ref}
      className="ai-rewrite-bar"
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
      <p className="ai-rewrite-bar-summary">{hint}</p>
      <div className="ai-rewrite-bar-actions">
        <button
          type="button"
          className="btn btn-ghost btn-icon ai-rewrite-reject"
          aria-label="拒绝"
          title="拒绝"
          onClick={onReject}
        >
          <IconClose size={15} />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-icon ai-rewrite-accept"
          aria-label="接受并替换"
          title="接受并替换"
          onClick={onAccept}
        >
          <IconCheck size={15} />
        </button>
      </div>
    </div>
  )
}
