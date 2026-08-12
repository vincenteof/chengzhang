import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { SelectionCoords } from './editor-types'

export type SelectionAiOp = 'organize' | 'expand' | 'polish' | 'feedback'

type Props = {
  coords: SelectionCoords | null
  visible: boolean
  /** Which op is running; only that button shows loading — others stay labeled. */
  activeOp?: SelectionAiOp | null
  instruction: string
  onInstructionChange: (value: string) => void
  onRun: (op: SelectionAiOp) => void
  /** Notify parent that user is interacting with bubble (keep selection alive). */
  onInteract?: () => void
}

const OPS: { op: SelectionAiOp; label: string }[] = [
  { op: 'organize', label: '组织' },
  { op: 'expand', label: '补写' },
  { op: 'polish', label: '润色' },
  { op: 'feedback', label: '反馈' },
]

const BUBBLE_GAP = 10
const EDGE = 8

function placeBubble(
  el: HTMLElement,
  coords: SelectionCoords,
): { top: number; left: number } {
  const w = el.offsetWidth
  const h = el.offsetHeight
  const midX = (coords.left + coords.right) / 2
  let left = midX - w / 2
  left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE))

  let top = coords.top - h - BUBBLE_GAP
  if (top < EDGE) {
    top = coords.bottom + BUBBLE_GAP
  }
  top = Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE))
  return { top, left }
}

/**
 * Floating card near selection: ops on top, instruction always below.
 * Clicking an op runs with the current instruction text.
 */
export function SelectionAiBubble({
  coords,
  visible,
  activeOp = null,
  instruction,
  onInstructionChange,
  onRun,
  onInteract,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const frozenCoordsRef = useRef<SelectionCoords | null>(null)

  useEffect(() => {
    if (!visible) frozenCoordsRef.current = null
  }, [visible])

  useEffect(() => {
    if (coords) frozenCoordsRef.current = coords
  }, [coords])

  const effectiveCoords = coords ?? frozenCoordsRef.current

  useLayoutEffect(() => {
    if (!visible || !effectiveCoords || !ref.current) {
      setPos(null)
      return
    }
    const apply = () => {
      if (!ref.current || !effectiveCoords) return
      if (ref.current.offsetWidth === 0) return
      setPos(placeBubble(ref.current, effectiveCoords))
    }
    apply()
    const id = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(id)
  }, [visible, effectiveCoords, instruction, activeOp])

  if (!visible || !effectiveCoords) return null

  const busy = activeOp != null

  return (
    <div
      ref={ref}
      className="selection-ai-bubble selection-ai-bubble--with-prompt"
      role="toolbar"
      aria-label="选区 AI"
      style={
        pos
          ? { top: pos.top, left: pos.left, opacity: 1 }
          : { top: -9999, left: -9999, opacity: 0 }
      }
    >
      <div className="selection-ai-bubble-row">
        {OPS.map(({ op, label }) => {
          const isActive = activeOp === op
          return (
            <button
              key={op}
              type="button"
              className="selection-ai-bubble-btn"
              disabled={busy}
              aria-busy={isActive}
              onPointerDown={(e) => {
                e.preventDefault()
                onInteract?.()
              }}
              onClick={() => {
                onInteract?.()
                onRun(op)
              }}
            >
              {isActive ? '…' : label}
            </button>
          )
        })}
      </div>
      <div className="selection-ai-bubble-field">
        <input
          className="selection-ai-bubble-input"
          value={instruction}
          disabled={busy}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder="自定义 AI 编辑"
          onFocus={() => onInteract?.()}
          onPointerDown={() => onInteract?.()}
          onKeyDown={(e) => {
            // Enter runs polish as a convenient default when instruction filled;
            // avoid accidental ops — only submit if user explicitly wants?
            // Prefer: Enter does nothing special / blurs. User clicks an op.
            if (e.key === 'Escape') {
              e.stopPropagation()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>
    </div>
  )
}
