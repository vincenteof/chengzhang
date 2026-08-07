import { markdown } from '@codemirror/lang-markdown'
import { history, historyKeymap, undo } from '@codemirror/commands'
import { EditorView, keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useCallback, useMemo, useRef } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function MarkdownEditor({ value, onChange, className }: Props) {
  const viewRef = useRef<EditorView | null>(null)

  const extensions = useMemo(
    () => [
      markdown(),
      history(),
      keymap.of(historyKeymap),
      EditorView.lineWrapping,
    ],
    [],
  )

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
        <span className="text-xs text-neutral-500">CodeMirror 6 · Markdown 源码</span>
      </div>
      <CodeMirror
        value={value}
        height="280px"
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
