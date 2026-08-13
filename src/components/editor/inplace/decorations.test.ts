/** @vitest-environment jsdom */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'

import { articleDecorations } from './decorations'

describe('articleDecorations', () => {
  it('attaches without throwing on markdown sample', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Title\n\nHello **world** and `code`.\n\n> quote\n\n- item\n',
        extensions: [markdown(), articleDecorations],
      }),
      parent,
    })
    expect(view.state.doc.lines).toBeGreaterThan(3)
    expect(view.state.doc.toString()).toContain('**world**')
    view.destroy()
    parent.remove()
  })
})
