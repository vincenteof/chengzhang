import { markdown } from '@codemirror/lang-markdown'
import { history, historyKeymap, undo } from '@codemirror/commands'
import { EditorView, keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useCallback, useMemo, useRef } from 'react'

export type EditorSelection = {
  from: number
  to: number
  text: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  onSelectionChange?: (selection: EditorSelection | null) => void
  className?: string
  height?: string
}

export function MarkdownEditor({
  value,
  onChange,
  onSelectionChange,
  className,
  height = '320px',
}: Props) {
  const viewRef = useRef<EditorView | null>(null)

  const extensions = useMemo(() => {
    const base = [
      markdown(),
      history(),
      keymap.of(historyKeymap),
      EditorView.lineWrapping,
    ]
    if (!onSelectionChange) return base

    return [
      ...base,
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return
        const range = update.state.selection.main
        if (range.empty) {
          onSelectionChange(null)
          return
        }
        const from = range.from
        const to = range.to
        const text = update.state.doc.sliceString(from, to)
        onSelectionChange({ from, to, text })
      }),
    ]
  }, [onSelectionChange])

  const handleCreate = useCallback((view: EditorView) => {
    viewRef.current = view
  }, [])

  const handleUndo = useCallback(() => {
    const view = viewRef.current
    if (view) {
      undo(view)
    }
  }, [])

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleUndo}
          className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          Undo
        </button>
        <span className="text-xs text-neutral-500">
          CodeMirror 6 · 选中文字后可用选区 AI
        </span>
      </div>
      <CodeMirror
        value={value}
        height={height}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={handleCreate}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
        }}
      />
    </div>
  )
}
