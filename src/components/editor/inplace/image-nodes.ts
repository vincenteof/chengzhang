import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

export type ImageRange = {
  from: number
  to: number
  alt: string
  url: string
}

const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/

export function parseImageMarkdown(
  text: string,
): { alt: string; url: string } | null {
  const match = IMAGE_RE.exec(text.trim())
  if (!match) return null
  return { alt: match[1] ?? '', url: match[2] ?? '' }
}

export function collectImageRanges(
  state: EditorState,
  from: number,
  to: number,
  keep?: { from: number; to: number } | null,
): ImageRange[] {
  const cursor = state.selection.main
  const found: ImageRange[] = []

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.name !== 'Image') return
      const kept =
        keep != null && keep.from === node.from && keep.to === node.to
      if (!kept && cursor.from < node.to && cursor.to > node.from) return false
      const text = state.doc.sliceString(node.from, node.to)
      const parsed = parseImageMarkdown(text)
      if (!parsed) return false
      found.push({
        from: node.from,
        to: node.to,
        alt: parsed.alt,
        url: parsed.url,
      })
      return false
    },
  })

  return found
}
