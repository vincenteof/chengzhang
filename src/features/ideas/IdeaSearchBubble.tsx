import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import type { IdeaListItem } from '#/modules/ideas/ideas.service'

function matches(idea: IdeaListItem, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (idea.name.toLowerCase().includes(q)) return true
  return (idea.description ?? '').toLowerCase().includes(q)
}

export function IdeaSearchBubble({
  ideas,
  activeId,
  anchor,
  onClose,
  onSelect,
}: {
  ideas: IdeaListItem[]
  activeId?: string
  anchor: HTMLElement
  onClose: () => void
  onSelect: (idea: IdeaListItem) => void
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLSpanElement>(null)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(() => {
    const idx = ideas.findIndex((idea) => idea.id === activeId)
    return idx >= 0 ? idx : 0
  })

  const filtered = useMemo(
    () => ideas.filter((idea) => matches(idea, query)),
    [ideas, query],
  )

  useEffect(() => {
    const next = ideas.filter((idea) => matches(idea, query))
    const idx = next.findIndex((idea) => idea.id === activeId)
    setHighlighted(idx >= 0 ? idx : 0)
  }, [ideas, query, activeId])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    function place() {
      if (!panel) return
      const box = anchor.getBoundingClientRect()
      const gap = 10
      const maxWidth = Math.min(296, window.innerWidth - box.right - 16)
      panel.style.width = `${Math.max(220, maxWidth)}px`
      const height = panel.offsetHeight
      let top = box.top
      const maxTop = window.innerHeight - height - 12
      if (top > maxTop) top = Math.max(12, maxTop)
      panel.style.left = `${box.right + gap}px`
      panel.style.top = `${top}px`
      if (caretRef.current) {
        const caretY = box.top + box.height / 2 - top
        caretRef.current.style.top = `${caretY}px`
      }
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, filtered.length, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const target = event.target as Node
      if (anchor.contains(target)) return
      if (panelRef.current?.contains(target)) return
      onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  useEffect(() => {
    const item = panelRef.current?.querySelector('[data-highlighted="true"]')
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  const safeIndex =
    filtered.length === 0 ? 0 : Math.min(highlighted, filtered.length - 1)
  const activeOption = filtered[safeIndex]
  const emptyCopy =
    ideas.length === 0 ? '还没有想法。展开边栏可以新建。' : '没有匹配的想法。'

  if (typeof document === 'undefined') return null

  return createPortal(
    <div ref={panelRef} className="idea-search-pop">
      <span ref={caretRef} className="idea-search-caret" aria-hidden />
      <div className="idea-search-bubble" role="dialog" aria-label="搜索想法">
        <input
          ref={inputRef}
          className="input idea-search-field"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="搜索想法"
          value={query}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={
            activeOption ? `${listId}-${activeOption.id}` : undefined
          }
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setHighlighted((i) =>
                filtered.length === 0
                  ? 0
                  : Math.min(i + 1, filtered.length - 1),
              )
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlighted((i) => Math.max(i - 1, 0))
            } else if (event.key === 'Enter' && activeOption) {
              event.preventDefault()
              onSelect(activeOption)
            }
          }}
        />
        {filtered.length === 0 ? (
          <p className="idea-search-empty">{emptyCopy}</p>
        ) : (
          <ul id={listId} className="idea-search-list" role="listbox">
            {filtered.map((idea, index) => (
              <li key={idea.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${idea.id}`}
                  role="option"
                  className="idea-search-item"
                  aria-selected={idea.id === activeId}
                  data-highlighted={safeIndex === index ? 'true' : undefined}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => onSelect(idea)}
                >
                  <span className="ideas-nav-name">{idea.name}</span>
                  <span className="ideas-nav-meta">
                    {idea.fragmentCount} 条碎片
                    {idea.hasDraft ? ' · 有正文' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
