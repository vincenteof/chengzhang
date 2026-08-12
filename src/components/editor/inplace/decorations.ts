/**
 * Phase 1 article chrome: mark + line decorations only.
 * Does NOT hide Markdown delimiters (no Decoration.replace for syntax).
 * See docs/INPLACE_MARKDOWN_EDITOR_TECHNICAL_PLAN.md §6.2 / §18.
 */
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { Decoration, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'

function mark(cls: string) {
  return Decoration.mark({ class: cls })
}

function line(cls: string) {
  return Decoration.line({ class: cls })
}

function buildDecorations(
  state: EditorState,
  from: number,
  to: number,
): DecorationSet {
  const ranges: { from: number; to: number; value: Decoration }[] = []

  const addMark = (a: number, b: number, cls: string) => {
    if (a < b && a >= from - 2 && b <= to + 2) {
      ranges.push({ from: a, to: b, value: mark(cls) })
    }
  }

  const addLine = (pos: number, cls: string) => {
    if (pos >= from - 2 && pos <= to + 2) {
      const lineNo = state.doc.lineAt(pos)
      ranges.push({ from: lineNo.from, to: lineNo.from, value: line(cls) })
    }
  }

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const { name, from: nFrom, to: nTo } = node

      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = name.slice(-1)
        addMark(nFrom, nTo, `cz-md-h${level}`)
        addLine(nFrom, `cz-md-line-h${level}`)
        return
      }

      if (name === 'StrongEmphasis') {
        addMark(nFrom, nTo, 'cz-md-strong')
        return
      }
      if (name === 'Emphasis') {
        addMark(nFrom, nTo, 'cz-md-em')
        return
      }
      if (name === 'Strikethrough') {
        addMark(nFrom, nTo, 'cz-md-strike')
        return
      }
      if (name === 'InlineCode') {
        addMark(nFrom, nTo, 'cz-md-code')
        return
      }
      if (name === 'Link') {
        addMark(nFrom, nTo, 'cz-md-link')
        return
      }
      if (name === 'URL' && node.node.parent?.name === 'Link') {
        // Phase 1: weaken URL visually only (Review §18.2 — do not hide)
        addMark(nFrom, nTo, 'cz-md-link-url')
        return
      }
      if (name === 'Blockquote') {
        addMark(nFrom, nTo, 'cz-md-blockquote')
        addLine(nFrom, 'cz-md-line-blockquote')
        return
      }
      if (name === 'ListItem') {
        addLine(nFrom, 'cz-md-line-list')
        return
      }
      if (name === 'ListMark') {
        addMark(nFrom, nTo, 'cz-md-list-mark')
        return
      }
      if (name === 'FencedCode') {
        addMark(nFrom, nTo, 'cz-md-codeblock')
        addLine(nFrom, 'cz-md-line-codeblock')
        return
      }
      if (name === 'HorizontalRule') {
        addMark(nFrom, nTo, 'cz-md-hr')
      }
    },
  })

  return Decoration.set(
    ranges.map((r) =>
      r.to === r.from ? r.value.range(r.from) : r.value.range(r.from, r.to),
    ),
    true,
  )
}

export const articleDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.recompute(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = this.recompute(update.view)
      }
    }

    recompute(view: EditorView): DecorationSet {
      if (view.visibleRanges.length === 0) {
        return buildDecorations(view.state, 0, view.state.doc.length)
      }
      // Merge visible ranges with small padding
      let from = view.visibleRanges[0]!.from
      let to = view.visibleRanges[0]!.to
      for (const r of view.visibleRanges) {
        from = Math.min(from, r.from)
        to = Math.max(to, r.to)
      }
      const pad = 200
      return buildDecorations(
        view.state,
        Math.max(0, from - pad),
        Math.min(view.state.doc.length, to + pad),
      )
    }
  },
  { decorations: (v) => v.decorations },
)
