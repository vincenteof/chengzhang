import { describe, expect, it } from 'vitest'

import {
  fragmentSnippet,
  isFragmentId,
  splitFragmentMentions,
} from './fragment-mentions'

const ID = 'frag_01936c5a-7a1b-7c2d-8e3f-0123456789ab'

describe('fragment mentions', () => {
  it('recognizes createId frag uuids', () => {
    expect(isFragmentId(ID)).toBe(true)
    expect(isFragmentId('frag_xxx')).toBe(false)
  })

  it('splits ids out of a sentence', () => {
    expect(splitFragmentMentions(`看 ${ID} 这句`)).toEqual([
      { kind: 'text', value: '看 ' },
      { kind: 'frag', id: ID },
      { kind: 'text', value: ' 这句' },
    ])
  })

  it('keeps punctuation outside the id', () => {
    const tokens = splitFragmentMentions(`（${ID}）。`)
    expect(tokens).toEqual([
      { kind: 'text', value: '（' },
      { kind: 'frag', id: ID },
      { kind: 'text', value: '）。' },
    ])
  })

  it('leaves ordinary text alone', () => {
    expect(splitFragmentMentions('没有引用')).toEqual([
      { kind: 'text', value: '没有引用' },
    ])
  })

  it('snips the first line for the chip', () => {
    expect(fragmentSnippet('工业革命后的手工业者\n第二行')).toBe(
      '工业革命后的手工业者',
    )
    expect(fragmentSnippet('这是一句很长的碎片原文不应该整段塞进按钮')).toBe(
      '这是一句很长的碎片原文不应该整段塞进按钮'.slice(0, 12) + '…',
    )
  })
})
