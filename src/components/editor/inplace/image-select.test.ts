import { EditorSelection, EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'

import {
  isExactImageSelection,
  selectedImageField,
  setSelectedImage,
} from './image-select'

describe('image selection', () => {
  it('treats a lone image syntax as an image selection', () => {
    expect(isExactImageSelection('![图](/api/media/img_abc)')).toBe(true)
    expect(isExactImageSelection('一段 ![图](/api/media/img_abc) 话')).toBe(
      false,
    )
  })

  it('keeps selected image when the cursor is set with the effect', () => {
    const doc = '![图](/api/media/img_abc)\n'
    let state = EditorState.create({
      doc,
      extensions: [markdown(), selectedImageField],
    })
    const range = { from: 0, to: doc.trimEnd().length }
    state = state.update({
      selection: { anchor: range.to },
      effects: setSelectedImage.of(range),
    }).state
    expect(state.field(selectedImageField)).toEqual(range)
  })

  it('clears selected image on a normal selection change', () => {
    const doc = '![图](/api/media/img_abc)\nnext'
    let state = EditorState.create({
      doc,
      extensions: [markdown(), selectedImageField],
    })
    const imageTo = doc.indexOf('\n')
    state = state.update({
      effects: setSelectedImage.of({ from: 0, to: imageTo }),
    }).state
    state = state.update({
      selection: EditorSelection.cursor(doc.indexOf('next')),
    }).state
    expect(state.field(selectedImageField)).toBeNull()
  })
})
