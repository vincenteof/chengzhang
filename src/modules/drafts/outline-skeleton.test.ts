import { describe, expect, it } from 'vitest'

import { outlineToMarkdownSkeleton } from './outline-skeleton'

describe('outlineToMarkdownSkeleton', () => {
  it('renders sections and missing material placeholders', () => {
    const md = outlineToMarkdownSkeleton({
      confirmedClaim: '主张一句',
      outline: {
        schemaVersion: 1,
        title: '测试文',
        approach: '先立论后展开',
        sections: [
          {
            id: 's1',
            title: '开篇',
            purpose: '建立共鸣',
            fragmentIds: ['frag_1'],
            missingMaterial: ['具体经历'],
          },
        ],
      },
    })

    expect(md).toContain('# 测试文')
    expect(md).toContain('主张一句')
    expect(md).toContain('## 开篇')
    expect(md).toContain('【待补：具体经历】')
  })
})
