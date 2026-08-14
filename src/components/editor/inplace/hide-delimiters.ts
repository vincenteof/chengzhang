import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

import { pendingRewriteField } from './ai-inline-diff'
import { resolveActiveBlock } from './active-block'

export type HideRange = { from: number; to: number }

const INLINE_PARENT = /^(?:StrongEmphasis|Emphasis|Strikethrough|InlineCode)$/

function eatTrailingSpaces(
  state: EditorState,
  from: number,
  lineTo: number,
): number {
  let i = from
  while (i < lineTo && state.doc.sliceString(i, i + 1) === ' ') i += 1
  return i
}

function overlapsSelection(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const sel = state.selection.main
  return sel.from < to && sel.to > from
}

function cursorInside(cursor: number, from: number, to: number) {
  return cursor >= from && cursor <= to
}

function reviewingRange(state: EditorState) {
  return state.field(pendingRewriteField, false)
}

function isReviewingRange(state: EditorState, from: number, to: number) {
  const pending = reviewingRange(state)
  return Boolean(pending && from < pending.to && to > pending.from)
}

/** During review, the pending span stays in layout mode even if the cursor is in it. */
function activityBlocksHide(
  state: EditorState,
  cursor: number,
  from: number,
  to: number,
) {
  if (isReviewingRange(state, from, to)) return false
  return cursorInside(cursor, from, to)
}

function addHide(
  hides: HideRange[],
  state: EditorState,
  viewportFrom: number,
  viewportTo: number,
  a: number,
  b: number,
) {
  if (a >= b) return
  if (b < viewportFrom - 2 || a > viewportTo + 2) return
  if (overlapsSelection(state, a, b) && !isReviewingRange(state, a, b)) return
  hides.push({ from: a, to: b })
}

type LinkNode = {
  firstChild: {
    name: string
    from: number
    to: number
    nextSibling: LinkNode['firstChild']
  } | null
  to: number
}

/** Fold `[label](url)` / `[label][ref]` down to the visible label. */
function hideInactiveLink(
  state: EditorState,
  link: LinkNode,
  add: (a: number, b: number) => void,
) {
  let open = -1
  let close = -1
  let hasDest = false
  for (let child = link.firstChild; child; child = child.nextSibling) {
    if (child.name === 'URL' || child.name === 'LinkLabel') hasDest = true
    if (child.name !== 'LinkMark') continue
    const mark = state.doc.sliceString(child.from, child.to)
    if (mark === '[' && open === -1) open = child.from
    if (mark === ']' && close === -1) close = child.from
  }
  if (!hasDest || open < 0 || close < 0) return
  add(open, open + 1)
  add(close, link.to)
}

function isBulletListMark(node: {
  node: { parent: { name: string; parent: { name: string } | null } | null }
}) {
  const item = node.node.parent
  return item?.name === 'ListItem' && item.parent?.name === 'BulletList'
}

/**
 * Short delimiters safe to fold with Decoration.replace({}).
 * Inline links hide `[]()` / URL when the cursor is outside that link.
 * Does not hide fence markers.
 */
export function collectHideRanges(
  state: EditorState,
  from: number,
  to: number,
): HideRange[] {
  const active = resolveActiveBlock(state)
  if (active.kind === 'multi' && !reviewingRange(state)) return []

  const cursor = state.selection.main.head
  const hides: HideRange[] = []
  const add = (a: number, b: number) => addHide(hides, state, from, to, a, b)

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const { name, from: nFrom, to: nTo } = node
      const parent = node.node.parent

      if (name === 'HeaderMark') {
        if (parent && activityBlocksHide(state, cursor, parent.from, parent.to))
          return
        const lineTo = state.doc.lineAt(nFrom).to
        add(nFrom, eatTrailingSpaces(state, nTo, lineTo))
        return
      }

      if (name === 'QuoteMark') {
        if (parent && activityBlocksHide(state, cursor, parent.from, parent.to))
          return
        const lineTo = state.doc.lineAt(nFrom).to
        add(nFrom, eatTrailingSpaces(state, nTo, lineTo))
        return
      }

      if (name === 'Link') {
        if (activityBlocksHide(state, cursor, nFrom, nTo)) return false
        if (
          overlapsSelection(state, nFrom, nTo) &&
          !isReviewingRange(state, nFrom, nTo)
        )
          return false
        hideInactiveLink(state, node.node, add)
        return false
      }

      if (name === 'EmphasisMark' || name === 'CodeMark') {
        if (!parent || !INLINE_PARENT.test(parent.name)) return
        if (activityBlocksHide(state, cursor, parent.from, parent.to)) return
        if (
          overlapsSelection(state, parent.from, parent.to) &&
          !isReviewingRange(state, parent.from, parent.to)
        )
          return
        add(nFrom, nTo)
      }
    },
  })

  hides.sort((a, b) => a.from - b.from || a.to - b.to)
  return hides
}

/** Unordered list marks to replace with a bullet widget (not OrderedList). */
export function collectBulletMarks(
  state: EditorState,
  from: number,
  to: number,
): HideRange[] {
  const active = resolveActiveBlock(state)
  if (active.kind === 'multi' && !reviewingRange(state)) return []

  const cursor = state.selection.main.head
  const marks: HideRange[] = []

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.name !== 'ListMark' || !isBulletListMark(node)) return
      const item = node.node.parent
      if (!item) return
      if (activityBlocksHide(state, cursor, item.from, item.to)) return
      if (
        overlapsSelection(state, item.from, item.to) &&
        !isReviewingRange(state, item.from, item.to)
      )
        return
      const lineTo = state.doc.lineAt(node.from).to
      addHide(
        marks,
        state,
        from,
        to,
        node.from,
        eatTrailingSpaces(state, node.to, lineTo),
      )
    },
  })

  marks.sort((a, b) => a.from - b.from || a.to - b.to)
  return marks
}
