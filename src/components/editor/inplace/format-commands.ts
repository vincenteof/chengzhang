import { syntaxTree } from '@codemirror/language'
import { EditorSelection, Prec } from '@codemirror/state'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'

import type { InlineMark } from '../editor-types'
import { sourceAnnotation } from './source-annotation'

export type { InlineMark }

const MARK = {
  bold: { node: 'StrongEmphasis', open: '**', close: '**' },
  italic: { node: 'Emphasis', open: '*', close: '*' },
  strike: { node: 'Strikethrough', open: '~~', close: '~~' },
  code: { node: 'InlineCode', open: '`', close: '`' },
} as const

const LINK_RE = /^\[([^\]]*)\]\(([^)]*)\)$/

export type MarkRange = { from: number; to: number }

function rangeOf(state: EditorState, range?: MarkRange): MarkRange {
  if (range) return range
  const sel = state.selection.main
  return { from: sel.from, to: sel.to }
}

function enclosing(
  state: EditorState,
  nodeName: string,
  range?: MarkRange,
): { from: number; to: number } | null {
  const sel = rangeOf(state, range)
  let found: { from: number; to: number } | null = null
  syntaxTree(state).iterate({
    from: sel.from,
    to: sel.to,
    enter(node) {
      if (
        node.name === nodeName &&
        node.from <= sel.from &&
        node.to >= sel.to
      ) {
        found = { from: node.from, to: node.to }
      }
    },
  })
  return found
}

export function activeInlineMarks(
  state: EditorState,
  range?: MarkRange,
): InlineMark[] {
  const sel = rangeOf(state, range)
  if (sel.from === sel.to) return []
  const marks: InlineMark[] = []
  if (enclosing(state, MARK.bold.node, sel)) marks.push('bold')
  if (enclosing(state, MARK.italic.node, sel)) marks.push('italic')
  if (enclosing(state, MARK.strike.node, sel)) marks.push('strike')
  if (enclosing(state, MARK.code.node, sel)) marks.push('code')
  if (enclosing(state, 'Link', sel)) marks.push('link')
  return marks
}

function wrapSpec(
  state: EditorState,
  open: string,
  close: string,
  range?: MarkRange,
): TransactionSpec {
  const sel = rangeOf(state, range)
  if (sel.from === sel.to) {
    const pos = sel.from
    return {
      changes: { from: pos, insert: open + close },
      selection: EditorSelection.cursor(pos + open.length),
      annotations: sourceAnnotation.of('user'),
    }
  }
  const text = state.doc.sliceString(sel.from, sel.to)
  return {
    changes: { from: sel.from, to: sel.to, insert: open + text + close },
    selection: EditorSelection.range(
      sel.from + open.length,
      sel.from + open.length + text.length,
    ),
    annotations: sourceAnnotation.of('user'),
  }
}

function unwrapSpec(from: number, to: number, inner: string): TransactionSpec {
  return {
    changes: { from, to, insert: inner },
    selection: EditorSelection.range(from, from + inner.length),
    annotations: sourceAnnotation.of('user'),
  }
}

function parseLink(raw: string): { text: string; url: string } | null {
  const match = LINK_RE.exec(raw.trim())
  if (!match) return null
  return { text: match[1] ?? '', url: match[2] ?? '' }
}

function linkSpec(
  state: EditorState,
  url?: string,
  range?: MarkRange,
): TransactionSpec | null {
  const node = enclosing(state, 'Link', range)
  if (node) {
    const raw = state.doc.sliceString(node.from, node.to)
    const parsed = parseLink(raw)
    const href = url?.trim()
    if (href && parsed) {
      const insert = `[${parsed.text}](${href})`
      return {
        changes: { from: node.from, to: node.to, insert },
        selection: EditorSelection.range(
          node.from + 1,
          node.from + 1 + parsed.text.length,
        ),
        annotations: sourceAnnotation.of('user'),
      }
    }
    const inner = parsed?.text ?? raw
    return unwrapSpec(node.from, node.to, inner)
  }

  const sel = rangeOf(state, range)
  if (sel.from === sel.to) return null
  const text = state.doc.sliceString(sel.from, sel.to)
  const href = url?.trim() || 'https://'
  const insert = `[${text}](${href})`
  const urlFrom = sel.from + 1 + text.length + 2
  const selectUrl = !url?.trim()
  return {
    changes: { from: sel.from, to: sel.to, insert },
    selection: selectUrl
      ? EditorSelection.range(urlFrom, urlFrom + href.length)
      : EditorSelection.range(sel.from + 1, sel.from + 1 + text.length),
    annotations: sourceAnnotation.of('user'),
  }
}

export function inlineMarkTransaction(
  state: EditorState,
  mark: InlineMark,
  url?: string,
  range?: MarkRange,
): TransactionSpec | null {
  if (mark === 'link') return linkSpec(state, url, range)
  const spec = MARK[mark]
  const node = enclosing(state, spec.node, range)
  if (node) {
    const inner = state.doc.sliceString(
      node.from + spec.open.length,
      node.to - spec.close.length,
    )
    return unwrapSpec(node.from, node.to, inner)
  }
  return wrapSpec(state, spec.open, spec.close, range)
}

export function runInlineMark(
  view: EditorView,
  mark: InlineMark,
  url?: string,
  range?: MarkRange,
): boolean {
  const spec = inlineMarkTransaction(view.state, mark, url, range)
  if (!spec) return false
  view.dispatch(spec)
  view.focus()
  return true
}

export function formatKeymap() {
  return Prec.high(
    keymap.of([
      { key: 'Mod-b', run: (view) => runInlineMark(view, 'bold') },
      { key: 'Mod-i', run: (view) => runInlineMark(view, 'italic') },
      { key: 'Mod-Shift-s', run: (view) => runInlineMark(view, 'strike') },
      { key: 'Mod-e', run: (view) => runInlineMark(view, 'code') },
      { key: 'Mod-k', run: (view) => runInlineMark(view, 'link') },
    ]),
  )
}
