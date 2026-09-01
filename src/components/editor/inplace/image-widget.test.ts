/** @vitest-environment jsdom */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'

import { createArticleDecorations } from './decorations'
import { selectedImageField, setSelectedImage } from './image-select'
import { ImageWidget } from './image-widget'

describe('image widget', () => {
  it('treats selected as a widget change so CodeMirror will restyle', () => {
    const idle = new ImageWidget('/api/media/a', '图', 0, 10, false)
    const selected = new ImageWidget('/api/media/a', '图', 0, 10, true)
    expect(idle.eq(selected)).toBe(false)
    expect(idle.eq(new ImageWidget('/api/media/a', '图', 0, 10, false))).toBe(
      true,
    )
  })

  it('applies is-selected when the selected-image field is set', () => {
    const doc = '![图](/api/media/img_abc)\n'
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          markdown(),
          selectedImageField,
          createArticleDecorations({
            articleChrome: true,
            hideDelimiters: false,
            bulletWidget: false,
            imageWidget: true,
            aiInlineDiff: false,
          }),
        ],
      }),
      parent,
    })
    expect(view.dom.querySelector('.cz-md-image')).not.toBeNull()
    expect(view.dom.querySelector('.cz-md-image.is-selected')).toBeNull()

    const range = { from: 0, to: doc.trimEnd().length }
    view.dispatch({
      selection: { anchor: range.to },
      effects: setSelectedImage.of(range),
    })
    expect(view.dom.querySelector('.cz-md-image.is-selected')).not.toBeNull()

    view.destroy()
    parent.remove()
  })
})
