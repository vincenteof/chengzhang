/** @vitest-environment jsdom */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'

import { createArticleDecorations } from './decorations'
import { collectBulletMarks, collectHideRanges } from './hide-delimiters'
import { resolveActiveBlock } from './active-block'

const SAMPLE = `# Title

Hello **world** and \`code\`.

> quote

- item
`

function stateAt(doc: string, anchor: number, head = anchor) {
  return EditorState.create({
    doc,
    selection: { anchor, head },
    extensions: [markdown()],
  })
}

describe('article decorations + hide delimiters', () => {
  it('attaches without changing document bytes', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state: EditorState.create({
        doc: SAMPLE,
        extensions: [
          markdown(),
          createArticleDecorations({
            articleChrome: true,
            hideDelimiters: true,
            bulletWidget: true,
            imageWidget: false,
            aiInlineDiff: false,
          }),
        ],
      }),
      parent,
    })
    expect(view.state.doc.toString()).toBe(SAMPLE)
    view.destroy()
    parent.remove()
  })
})

describe('resolveActiveBlock', () => {
  it('finds the heading at the cursor', () => {
    const state = stateAt(SAMPLE, 3)
    const active = resolveActiveBlock(state)
    expect(active.kind).toBe('block')
    if (active.kind === 'block') {
      expect(active.name).toBe('ATXHeading1')
    }
  })

  it('marks a cross-block selection as multi', () => {
    const state = stateAt(SAMPLE, 0, SAMPLE.length)
    expect(resolveActiveBlock(state).kind).toBe('multi')
  })
})

describe('collectHideRanges', () => {
  it('hides heading marks when cursor is in a later paragraph', () => {
    const hello = SAMPLE.indexOf('Hello')
    const ranges = collectHideRanges(stateAt(SAMPLE, hello), 0, SAMPLE.length, {
      composing: false,
    })
    expect(ranges.some((r) => SAMPLE.slice(r.from, r.to).startsWith('#'))).toBe(
      true,
    )
  })

  it('keeps heading marks when the heading is active', () => {
    const ranges = collectHideRanges(stateAt(SAMPLE, 3), 0, SAMPLE.length, {
      composing: false,
    })
    expect(ranges.some((r) => SAMPLE.slice(r.from, r.to).includes('#'))).toBe(
      false,
    )
  })

  it('hides emphasis marks when cursor is outside that node', () => {
    const hello = SAMPLE.indexOf('Hello')
    const ranges = collectHideRanges(stateAt(SAMPLE, hello), 0, SAMPLE.length, {
      composing: false,
    })
    const hidden = ranges.map((r) => SAMPLE.slice(r.from, r.to))
    expect(hidden).toContain('**')
  })

  it('does not hide while composing', () => {
    const hello = SAMPLE.indexOf('Hello')
    const ranges = collectHideRanges(stateAt(SAMPLE, hello), 0, SAMPLE.length, {
      composing: true,
    })
    expect(ranges).toEqual([])
  })

  it('hides link URL and brackets when cursor is outside the link', () => {
    const doc = 'See [docs](https://example.com) please.\n'
    const pos = doc.indexOf('See')
    const ranges = collectHideRanges(stateAt(doc, pos), 0, doc.length, {
      composing: false,
    })
    const hidden = ranges.map((r) => doc.slice(r.from, r.to)).join('')
    expect(hidden).toContain('https://example.com')
    expect(hidden).toContain('[')
    expect(doc.includes('docs') && !hidden.includes('docs')).toBe(true)
  })

  it('keeps the full link syntax when the cursor is inside it', () => {
    const doc = 'See [docs](https://example.com) please.\n'
    const pos = doc.indexOf('docs')
    const ranges = collectHideRanges(stateAt(doc, pos), 0, doc.length, {
      composing: false,
    })
    const hidden = ranges.map((r) => doc.slice(r.from, r.to)).join('')
    expect(hidden).not.toContain('https://example.com')
  })

  it('does not fold autolinks or images', () => {
    const auto = 'See <https://autolink.example> please.\n'
    const image = 'See ![alt](https://img.example/a.png) please.\n'
    const autoHidden = collectHideRanges(stateAt(auto, 0), 0, auto.length, {
      composing: false,
    })
      .map((r) => auto.slice(r.from, r.to))
      .join('')
    const imageHidden = collectHideRanges(stateAt(image, 0), 0, image.length, {
      composing: false,
    })
      .map((r) => image.slice(r.from, r.to))
      .join('')
    expect(autoHidden).not.toContain('https://autolink.example')
    expect(imageHidden).not.toContain('https://img.example/a.png')
  })
})

describe('collectBulletMarks', () => {
  it('replaces unordered marks when the cursor is outside that item', () => {
    const hello = SAMPLE.indexOf('Hello')
    const marks = collectBulletMarks(stateAt(SAMPLE, hello), 0, SAMPLE.length, {
      composing: false,
    })
    expect(marks.some((r) => SAMPLE.slice(r.from, r.to).startsWith('-'))).toBe(
      true,
    )
  })

  it('keeps the dash when the cursor is in that list item', () => {
    const item = SAMPLE.indexOf('item')
    const marks = collectBulletMarks(stateAt(SAMPLE, item), 0, SAMPLE.length, {
      composing: false,
    })
    expect(marks).toEqual([])
  })

  it('does not replace ordered-list marks', () => {
    const doc = 'Note\n\n1. first\n2. second\n'
    const marks = collectBulletMarks(stateAt(doc, 0), 0, doc.length, {
      composing: false,
    })
    expect(marks).toEqual([])
  })
})
