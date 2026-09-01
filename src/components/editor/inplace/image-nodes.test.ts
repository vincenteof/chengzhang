import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'

import { collectImageRanges, parseImageMarkdown } from './image-nodes'

function stateAt(doc: string, anchor: number) {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown()],
  })
}

describe('image nodes', () => {
  it('parses markdown image syntax', () => {
    expect(parseImageMarkdown('![猫](https://ex.com/a.png)')).toEqual({
      alt: '猫',
      url: 'https://ex.com/a.png',
    })
    expect(parseImageMarkdown('not an image')).toBeNull()
  })

  it('collects images when the cursor is outside', () => {
    const doc = '见 ![图](/api/media/img_abc) 后\n'
    const ranges = collectImageRanges(stateAt(doc, 0), 0, doc.length)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]?.url).toBe('/api/media/img_abc')
    expect(ranges[0]?.alt).toBe('图')
  })

  it('does not replace the image the cursor is in', () => {
    const doc = '![图](/api/media/img_abc)\n'
    const inside = doc.indexOf('图')
    expect(collectImageRanges(stateAt(doc, inside), 0, doc.length)).toEqual([])
  })

  it('keeps a selected image even when the cursor is inside', () => {
    const doc = '![图](/api/media/img_abc)\n'
    const range = { from: 0, to: doc.trimEnd().length }
    const inside = doc.indexOf('图')
    const found = collectImageRanges(stateAt(doc, inside), 0, doc.length, range)
    expect(found).toHaveLength(1)
    expect(found[0]?.from).toBe(range.from)
    expect(found[0]?.to).toBe(range.to)
  })
})
