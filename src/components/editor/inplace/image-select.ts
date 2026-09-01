import { Prec, RangeSet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView, keymap } from '@codemirror/view'

import { collectImageRanges, parseImageMarkdown } from './image-nodes'
import { sourceAnnotation } from './source-annotation'

export type SelectedImage = { from: number; to: number }

export const setSelectedImage = StateEffect.define<SelectedImage | null>()

export const selectedImageField = StateField.define<SelectedImage | null>({
  create: () => null,
  update(value, tr) {
    let next = value
    for (const effect of tr.effects) {
      if (effect.is(setSelectedImage)) next = effect.value
    }
    if (tr.docChanged && next) {
      const from = tr.changes.mapPos(next.from, 1)
      const to = tr.changes.mapPos(next.to, -1)
      next = from < to ? { from, to } : null
    }
    const fromEffect = tr.effects.some((effect) => effect.is(setSelectedImage))
    if (!fromEffect && !tr.startState.selection.eq(tr.newSelection)) {
      next = null
    }
    return next
  },
})

const atomicMark = Decoration.mark({ inclusive: false })

function deleteSelectedImage(view: EditorView): boolean {
  const selected = view.state.field(selectedImageField, false)
  if (!selected) return false
  view.dispatch({
    changes: { from: selected.from, to: selected.to, insert: '' },
    selection: { anchor: selected.from },
    effects: setSelectedImage.of(null),
    annotations: sourceAnnotation.of('user'),
  })
  return true
}

function clearSelectedImage(view: EditorView): boolean {
  const selected = view.state.field(selectedImageField, false)
  if (!selected) return false
  view.dispatch({ effects: setSelectedImage.of(null) })
  return true
}

export function selectImageInView(
  view: EditorView,
  range: SelectedImage,
): void {
  view.dispatch({
    selection: { anchor: range.to },
    effects: setSelectedImage.of(range),
    scrollIntoView: true,
  })
  view.focus()
}

export function isExactImageSelection(text: string): boolean {
  const trimmed = text.trim()
  return parseImageMarkdown(trimmed) != null
}

export function imageAtSelection(state: EditorState): SelectedImage | null {
  const sel = state.selection.main
  if (sel.empty) return state.field(selectedImageField, false) ?? null
  const text = state.doc.sliceString(sel.from, sel.to)
  if (!isExactImageSelection(text)) return null
  return { from: sel.from, to: sel.to }
}

export function imageSelectExtensions(): Extension[] {
  return [
    selectedImageField,
    EditorView.atomicRanges.of((view) => {
      const selected = view.state.field(selectedImageField, false)
      const images = collectImageRanges(
        view.state,
        0,
        view.state.doc.length,
        selected,
      )
      if (images.length === 0) return RangeSet.empty
      return RangeSet.of(
        images.map((image) => atomicMark.range(image.from, image.to)),
        true,
      )
    }),
    Prec.high(
      keymap.of([
        { key: 'Backspace', run: deleteSelectedImage },
        { key: 'Delete', run: deleteSelectedImage },
        { key: 'Escape', run: clearSelectedImage },
      ]),
    ),
  ]
}
