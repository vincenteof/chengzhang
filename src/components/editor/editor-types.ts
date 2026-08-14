/** Display mode. Both keep the same Markdown bytes; inplace adds chrome and may hide delimiters. */
export type EditorMode = 'inplace' | 'source'

export type EditorSelection = {
  from: number
  to: number
  text: string
}

/** Viewport coordinates (getBoundingClientRect space) for floating UI. */
export type SelectionCoords = {
  top: number
  bottom: number
  left: number
  right: number
}

export type TextChange = {
  from: number
  to: number
  insert: string
}

export type TransactionSource = 'user' | 'ai' | 'server' | 'recovery' | 'mode'

export type MarkdownEditorHandle = {
  getContent: () => string
  getSelection: () => EditorSelection | null
  /** Last non-empty selection (survives brief blur for mobile AI sheet). */
  getLogicalSelection: () => EditorSelection | null
  clearLogicalSelection: () => void
  /** Selection box in viewport coordinates for bubbles. */
  getSelectionCoords: () => SelectionCoords | null
  getRangeCoords: (from: number, to: number) => SelectionCoords | null
  setPendingRewrite: (input: {
    from: number
    to: number
    original: string
    rewritten: string
  }) => void
  clearPendingRewrite: () => void
  replaceRange: (
    change: TextChange,
    options?: { source?: TransactionSource; selectResult?: boolean },
  ) => void
  replaceDocument: (
    content: string,
    options?: { source?: TransactionSource },
  ) => void
  setCursor: (pos: number) => void
  setMode: (mode: EditorMode) => void
  getMode: () => EditorMode
  focus: () => void
  undo: () => void
  redo: () => void
  isComposing: () => boolean
}
