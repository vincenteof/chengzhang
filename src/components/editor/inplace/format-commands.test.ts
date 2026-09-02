import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'

import { activeInlineMarks, inlineMarkTransaction } from './format-commands'

function stateAt(doc: string, from: number, to = from) {
  return EditorState.create({
    doc,
    selection: { anchor: from, head: to },
    extensions: [markdown()],
  })
}

function apply(
  doc: string,
  from: number,
  to: number,
  mark: 'bold' | 'italic' | 'strike' | 'code' | 'link',
  url?: string,
) {
  const state = stateAt(doc, from, to)
  const spec = inlineMarkTransaction(state, mark, url)
  expect(spec).not.toBeNull()
  return state.update(spec!).state
}

describe('inline format commands', () => {
  it('wraps and unwraps bold around a selection', () => {
    const wrapped = apply('见 文字 后', 2, 4, 'bold')
    expect(wrapped.doc.toString()).toBe('见 **文字** 后')
    expect(
      wrapped.doc.sliceString(
        wrapped.selection.main.from,
        wrapped.selection.main.to,
      ),
    ).toBe('文字')
    expect(activeInlineMarks(wrapped)).toEqual(['bold'])

    const unwrapped = wrapped.update(
      inlineMarkTransaction(wrapped, 'bold')!,
    ).state
    expect(unwrapped.doc.toString()).toBe('见 文字 后')
  })

  it('wraps italic, strike, and code', () => {
    expect(apply('abc', 0, 3, 'italic').doc.toString()).toBe('*abc*')
    expect(apply('abc', 0, 3, 'strike').doc.toString()).toBe('~~abc~~')
    expect(apply('abc', 0, 3, 'code').doc.toString()).toBe('`abc`')
  })

  it('wraps a link with a url and unwraps back to text', () => {
    const linked = apply('成章', 0, 2, 'link', 'https://chengzhang.app')
    expect(linked.doc.toString()).toBe('[成章](https://chengzhang.app)')
    expect(activeInlineMarks(linked)).toEqual(['link'])

    const unwrapped = linked.update(
      inlineMarkTransaction(linked, 'link')!,
    ).state
    expect(unwrapped.doc.toString()).toBe('成章')
  })

  it('inserts delimiters around an empty cursor', () => {
    const next = apply('ab', 1, 1, 'bold')
    expect(next.doc.toString()).toBe('a****b')
    expect(next.selection.main.from).toBe(3)
  })

  it('applies to an explicit range when the cursor has moved', () => {
    const state = stateAt('见 文字 后', 0)
    const spec = inlineMarkTransaction(state, 'bold', undefined, {
      from: 2,
      to: 4,
    })
    expect(spec).not.toBeNull()
    expect(state.update(spec!).state.doc.toString()).toBe('见 **文字** 后')
  })
})
