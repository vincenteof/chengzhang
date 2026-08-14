/**
 * Phase 1–2: mark / line article chrome + optional short-delimiter hide.
 * See docs/INPLACE_MARKDOWN_EDITOR_TECHNICAL_PLAN.md §6 / §18.
 */
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'

import { collectBulletMarks, collectHideRanges } from './hide-delimiters'
import type { InplaceCapability } from './platform-policy'

class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cz-md-bullet'
    el.textContent = '• '
    el.setAttribute('aria-hidden', 'true')
    return el
  }

  eq() {
    return true
  }

  ignoreEvent() {
    return true
  }
}

const bulletWidget = new BulletWidget()
const bulletReplace = Decoration.replace({ widget: bulletWidget })

function mark(cls: string) {
  return Decoration.mark({ class: cls })
}

function line(cls: string) {
  return Decoration.line({ class: cls })
}

const hideMark = Decoration.replace({})

function buildChrome(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number; value: Decoration }[] {
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

  return ranges
}

function viewportSpan(view: EditorView): { from: number; to: number } {
  if (view.visibleRanges.length === 0) {
    return { from: 0, to: view.state.doc.length }
  }
  let from = view.visibleRanges[0]!.from
  let to = view.visibleRanges[0]!.to
  for (const r of view.visibleRanges) {
    from = Math.min(from, r.from)
    to = Math.max(to, r.to)
  }
  const pad = 200
  return {
    from: Math.max(0, from - pad),
    to: Math.min(view.state.doc.length, to + pad),
  }
}

function buildDecorations(
  view: EditorView,
  capability: InplaceCapability,
): DecorationSet {
  const { from, to } = viewportSpan(view)
  const ranges = capability.articleChrome
    ? buildChrome(view.state, from, to)
    : []

  if (capability.hideDelimiters) {
    for (const hide of collectHideRanges(view.state, from, to)) {
      ranges.push({ from: hide.from, to: hide.to, value: hideMark })
    }
  }

  if (capability.bulletWidget) {
    for (const bullet of collectBulletMarks(view.state, from, to)) {
      ranges.push({ from: bullet.from, to: bullet.to, value: bulletReplace })
    }
  }

  return Decoration.set(
    ranges.map((r) =>
      r.to === r.from ? r.value.range(r.from) : r.value.range(r.from, r.to),
    ),
    true,
  )
}

export function createArticleDecorations(capability: InplaceCapability) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, capability)
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = buildDecorations(update.view, capability)
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}
