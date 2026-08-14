import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import { sourceAnnotation } from './source-annotation'

export type DiffHunk =
  | { type: 'eq'; text: string }
  | { type: 'del'; text: string }
  | { type: 'ins'; text: string }

export type PendingRewrite = {
  from: number
  to: number
  original: string
  rewritten: string
  hunks: DiffHunk[]
  expanded: number[]
}

export const setPendingRewriteEffect =
  StateEffect.define<PendingRewrite | null>()
export const expandDiffFoldEffect = StateEffect.define<number>()

export const FOLD_INS_AT = 80

/** Display-only: fold common Markdown so insert widgets match layout mode. */
export function presentMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

export function isFormatOnlyChange(
  original: string,
  rewritten: string,
): boolean {
  if (original === rewritten) return false
  const norm = (s: string) => presentMarkdown(s).replace(/\s+/g, ' ').trim()
  return norm(original) === norm(rewritten)
}

export function tokenize(text: string): string[] {
  return (
    text.match(/\s+|[\u3400-\u9fff]|[A-Za-z0-9]+|[^\s]/g) ??
    (text ? [text] : [])
  )
}

function mergeHunks(hunks: DiffHunk[]): DiffHunk[] {
  const out: DiffHunk[] = []
  for (const hunk of hunks) {
    const last = out[out.length - 1]
    if (last && last.type === hunk.type) {
      last.text += hunk.text
    } else {
      out.push({ ...hunk })
    }
  }
  return out
}

/** Token LCS. Reconstructs the original string exactly when tokens are joined. */
export function diffTokens(original: string, rewritten: string): DiffHunk[] {
  const a = tokenize(original)
  const b = tokenize(rewritten)
  if (a.join('') !== original || b.join('') !== rewritten) {
    return mergeHunks([
      { type: 'del', text: original },
      { type: 'ins', text: rewritten },
    ])
  }
  if (a.length * b.length > 400_000) {
    return mergeHunks([
      { type: 'del', text: original },
      { type: 'ins', text: rewritten },
    ])
  }

  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  )
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!
    const next = dp[i + 1]!
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!)
    }
  }

  const hunks: DiffHunk[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      hunks.push({ type: 'eq', text: a[i]! })
      i += 1
      j += 1
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      hunks.push({ type: 'del', text: a[i]! })
      i += 1
    } else {
      hunks.push({ type: 'ins', text: b[j]! })
      j += 1
    }
  }
  while (i < n) {
    hunks.push({ type: 'del', text: a[i]! })
    i += 1
  }
  while (j < m) {
    hunks.push({ type: 'ins', text: b[j]! })
    j += 1
  }
  return mergeHunks(hunks)
}

export function buildPendingRewrite(input: {
  from: number
  to: number
  original: string
  rewritten: string
}): PendingRewrite {
  return {
    ...input,
    hunks: diffTokens(input.original, input.rewritten),
    expanded: [],
  }
}

class InsertWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly folded: boolean,
    readonly index: number,
  ) {
    super()
  }

  eq(other: InsertWidget) {
    return (
      this.text === other.text &&
      this.folded === other.folded &&
      this.index === other.index
    )
  }

  toDOM(view: EditorView) {
    const el = document.createElement('span')
    el.className = this.folded ? 'cz-ai-ins cz-ai-ins-fold' : 'cz-ai-ins'
    const shown = presentMarkdown(this.text)
    el.textContent = this.folded ? `+${[...shown].length} 字` : shown
    if (this.folded) {
      el.setAttribute('role', 'button')
      el.tabIndex = 0
      el.title = '展开插入'
      el.addEventListener('mousedown', (event) => {
        event.preventDefault()
        view.dispatch({ effects: expandDiffFoldEffect.of(this.index) })
      })
    }
    return el
  }

  ignoreEvent() {
    return !this.folded
  }
}

const eqMark = Decoration.mark({ class: 'cz-ai-eq' })
const delMark = Decoration.mark({ class: 'cz-ai-del' })

export function decorationsForPending(pending: PendingRewrite): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = []
  let pos = pending.from
  pending.hunks.forEach((hunk, index) => {
    if (hunk.type === 'eq') {
      if (hunk.text.length > 0) {
        ranges.push(eqMark.range(pos, pos + hunk.text.length))
      }
      pos += hunk.text.length
      return
    }
    if (hunk.type === 'del') {
      if (hunk.text.length > 0) {
        ranges.push(delMark.range(pos, pos + hunk.text.length))
      }
      pos += hunk.text.length
      return
    }
    if (hunk.text.length === 0) return
    const folded =
      hunk.text.length >= FOLD_INS_AT && !pending.expanded.includes(index)
    ranges.push(
      Decoration.widget({
        widget: new InsertWidget(hunk.text, folded, index),
        side: 1,
      }).range(pos),
    )
  })
  return Decoration.set(ranges, true)
}

export const pendingRewriteField = StateField.define<PendingRewrite | null>({
  create: () => null,
  update(value, tr) {
    let next = value
    for (const effect of tr.effects) {
      if (effect.is(setPendingRewriteEffect)) next = effect.value
      if (effect.is(expandDiffFoldEffect) && next) {
        if (!next.expanded.includes(effect.value)) {
          next = { ...next, expanded: [...next.expanded, effect.value] }
        }
      }
    }
    if (next && tr.docChanged) {
      const source = tr.annotation(sourceAnnotation)
      if (source && source !== 'user') return null
      return null
    }
    return next
  },
  provide: (field) =>
    EditorView.decorations.from(field, (pending) =>
      pending ? decorationsForPending(pending) : Decoration.none,
    ),
})
