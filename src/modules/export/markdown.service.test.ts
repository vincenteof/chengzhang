import { describe, expect, it } from 'vitest'

import { buildMarkdownDocument, safeFilename } from './markdown.service'

describe('buildMarkdownDocument', () => {
  it('serializes front matter safely without empty optional fields', () => {
    const md = buildMarkdownDocument(
      {
        title: '标题 "引号"',
        description: '摘要：中文',
        slug: 'hello-world',
        tags: ['a', 'b'],
      },
      '# Body\n\n内容 --- 测试',
    )

    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('title: ')
    expect(md).toContain('slug: hello-world')
    expect(md).toContain('# Body')
    expect(md).not.toContain('description: null')
  })

  it('omits empty optional fields', () => {
    const md = buildMarkdownDocument({ title: 'Only Title' }, 'hi')
    expect(md).not.toContain('description:')
    expect(md).not.toContain('slug:')
    expect(md).not.toContain('tags:')
  })
})

describe('safeFilename', () => {
  it('strips path separators and control characters', () => {
    expect(safeFilename({ title: '../evil/name.md' })).not.toContain('/')
    expect(safeFilename({ title: 'a\u0000b' })).not.toContain('\u0000')
  })

  it('prefers slug', () => {
    expect(safeFilename({ title: 'Title', slug: 'my-slug' })).toBe('my-slug')
  })
})
