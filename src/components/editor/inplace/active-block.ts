import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

const BLOCK_NAME =
  /^(?:ATXHeading[1-6]|SetextHeading[12]|Paragraph|Blockquote|ListItem|FencedCode|HTMLBlock|HorizontalRule|Table)$/

export type ActiveBlock =
  | { kind: 'none' }
  | { kind: 'multi' }
  | { kind: 'block'; from: number; to: number; name: string }

type BlockSpan = { from: number; to: number; name: string }

function innermostBlockAt(state: EditorState, pos: number): BlockSpan | null {
  let found: BlockSpan | null = null
  syntaxTree(state).iterate({
    from: pos,
    to: pos,
    enter(node) {
      if (BLOCK_NAME.test(node.name) && pos >= node.from && pos <= node.to) {
        found = { from: node.from, to: node.to, name: node.name }
      }
    },
  })
  return found
}

function blocksOverlapping(state: EditorState, from: number, to: number) {
  const blocks: { from: number; to: number; name: string }[] = []
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (!BLOCK_NAME.test(node.name)) return
      if (node.to <= from || node.from >= to) return
      // Skip ancestors that fully contain a more specific block we will also see
      blocks.push({ from: node.from, to: node.to, name: node.name })
    },
  })
  // Keep leaf-most blocks: drop any block that strictly contains another
  return blocks.filter(
    (a) =>
      !blocks.some(
        (b) =>
          b !== a &&
          b.from >= a.from &&
          b.to <= a.to &&
          b.to - b.from < a.to - a.from,
      ),
  )
}

export function resolveActiveBlock(state: EditorState): ActiveBlock {
  const sel = state.selection.main
  if (sel.from !== sel.to) {
    const blocks = blocksOverlapping(state, sel.from, sel.to)
    if (blocks.length === 0) return { kind: 'none' }
    if (blocks.length > 1) return { kind: 'multi' }
    const only = blocks[0]!
    return { kind: 'block', from: only.from, to: only.to, name: only.name }
  }
  const block = innermostBlockAt(state, sel.head)
  if (!block) return { kind: 'none' }
  return { kind: 'block', from: block.from, to: block.to, name: block.name }
}

export function isPosInActiveBlock(
  active: ActiveBlock,
  from: number,
  to: number,
): boolean {
  if (active.kind === 'multi') return true
  if (active.kind === 'none') return false
  return from < active.to && to > active.from
}
