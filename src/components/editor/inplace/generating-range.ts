import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

export type GeneratingRange = { from: number; to: number }

export const setGeneratingRangeEffect =
  StateEffect.define<GeneratingRange | null>()

const generatingMark = Decoration.mark({ class: 'cz-ai-generating' })

export const generatingRangeField = StateField.define<GeneratingRange | null>({
  create: () => null,
  update(value, tr) {
    let next = value
    for (const effect of tr.effects) {
      if (effect.is(setGeneratingRangeEffect)) next = effect.value
    }
    if (next && tr.docChanged) return null
    return next
  },
  provide: (field) => [
    EditorView.decorations.from(field, (range) => {
      if (!range || range.to <= range.from) return Decoration.none
      return Decoration.set([generatingMark.range(range.from, range.to)])
    }),
    EditorView.editorAttributes.from(field, (range) => ({
      class: range ? 'cz-ai-busy' : '',
    })),
  ],
})
