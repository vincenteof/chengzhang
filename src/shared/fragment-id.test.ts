import { describe, expect, it } from 'vitest'

import { isFragmentId, stripFragmentCitations } from './fragment-id'

const ID = 'frag_01a0341e-c758-7659-83b6-0c97e0dcc2d1'

describe('stripFragmentCitations', () => {
  it('drops bracketed fragment ids', () => {
    expect(stripFragmentCitations(`前面 [${ID}] 后面`)).toBe('前面 后面')
  })

  it('drops meta source placeholders', () => {
    expect(
      stripFragmentCitations('这一点[其中一个对话片段]其实早就出现过。'),
    ).toBe('这一点其实早就出现过。')
  })

  it('leaves ordinary prose', () => {
    expect(stripFragmentCitations('保留有辨识度的原话。')).toBe(
      '保留有辨识度的原话。',
    )
  })

  it('recognizes createId frag uuids', () => {
    expect(isFragmentId(ID)).toBe(true)
    expect(isFragmentId('frag_xxx')).toBe(false)
  })
})
