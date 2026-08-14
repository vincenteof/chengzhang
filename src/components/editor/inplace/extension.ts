import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  placeholder as placeholderExt,
} from '@codemirror/view'

import { pendingRewriteField } from './ai-inline-diff'
import { generatingRangeField } from './generating-range'
import { createArticleDecorations } from './decorations'
import { resolveInplaceCapability } from './platform-policy'

export { undo, redo }

export function buildBaseExtensions(placeholderText?: string): Extension[] {
  return [
    ...(placeholderText ? [placeholderExt(placeholderText)] : []),
    markdown({ base: markdownLanguage }),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'true' }),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(false),
    pendingRewriteField,
    generatingRangeField,
  ]
}

/** Phase 2: article chrome + desktop short-delimiter hide. */
export function buildInplaceExtensions(): Extension[] {
  const capability = resolveInplaceCapability({ mode: 'inplace' })
  return [createArticleDecorations(capability)]
}
