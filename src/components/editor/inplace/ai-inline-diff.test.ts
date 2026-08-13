import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import {
  FOLD_INS_AT,
  buildPendingRewrite,
  decorationsForPending,
  diffTokens,
  tokenize,
} from './ai-inline-diff'

describe('tokenize', () => {
  it('round-trips CJK and latin', () => {
    const text = '非常非常好 hello\n世界'
    expect(tokenize(text).join('')).toBe(text)
  })
})

describe('diffTokens', () => {
  it('marks a polish-style rewrite', () => {
    const hunks = diffTokens('非常非常好 12', '很好 12')
    expect(hunks.map((h) => `${h.type}:${h.text}`)).toEqual([
      'del:非常非常',
      'ins:很',
      'eq:好 12',
    ])
  })

  it('treats an expand as a single insert when prefix matches', () => {
    const hunks = diffTokens('开头', '开头后面补了一段')
    expect(hunks[0]).toEqual({ type: 'eq', text: '开头' })
    expect(hunks.some((h) => h.type === 'ins')).toBe(true)
    expect(hunks.filter((h) => h.type === 'del')).toEqual([])
  })
})

describe('decorationsForPending', () => {
  it('does not change document bytes', () => {
    const original = '非常非常好'
    const pending = buildPendingRewrite({
      from: 0,
      to: original.length,
      original,
      rewritten: '很好',
    })
    const state = EditorState.create({ doc: original })
    expect(state.doc.toString()).toBe(original)
    const set = decorationsForPending(pending)
    let count = 0
    set.between(0, original.length, () => {
      count += 1
    })
    expect(count).toBeGreaterThan(0)
  })

  it('folds long inserts until expanded', () => {
    const insert = '补'.repeat(FOLD_INS_AT)
    const pending = buildPendingRewrite({
      from: 0,
      to: 2,
      original: '开头',
      rewritten: `开头${insert}`,
    })
    const ins = pending.hunks.find((h) => h.type === 'ins')
    expect(ins?.text.length).toBeGreaterThanOrEqual(FOLD_INS_AT)
    expect(pending.expanded).toEqual([])
  })
})
