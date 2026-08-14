import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react'

import type {
  EditorMode,
  EditorSelection,
  MarkdownEditorHandle,
  SelectionCoords,
  TransactionSource,
} from './editor-types'
import {
  buildPendingRewrite,
  pendingRewriteField,
  setPendingRewriteEffect,
} from './inplace/ai-inline-diff'
import { setGeneratingRangeEffect } from './inplace/generating-range'
import {
  buildBaseExtensions,
  buildInplaceExtensions,
  redo,
  undo,
} from './inplace/extension'
import { sourceAnnotation } from './inplace/source-annotation'

export type {
  EditorMode,
  EditorSelection,
  MarkdownEditorHandle,
  SelectionCoords,
}

type Props = {
  /** Initial document only — live text lives in CodeMirror (Phase 0). */
  initialContent: string
  onContentChange?: (content: string, source: TransactionSource) => void
  onSelectionChange?: (selection: EditorSelection | null) => void
  /** Fires when selection box should move (select / scroll / viewport). */
  onSelectionCoords?: (coords: SelectionCoords | null) => void
  /** Fires when a pending inline rewrite is dropped because the user edited. */
  onPendingRewriteDiscarded?: () => void
  mode?: EditorMode
  placeholder?: string
  className?: string
  /** CSS height of the editor surface. */
  height?: string
}

function readSelection(state: EditorState): EditorSelection | null {
  const range = state.selection.main
  if (range.empty) return null
  return {
    from: range.from,
    to: range.to,
    text: state.doc.sliceString(range.from, range.to),
  }
}

function readSelectionCoords(view: EditorView): SelectionCoords | null {
  const range = view.state.selection.main
  if (range.empty) return null
  const start = view.coordsAtPos(range.from)
  const end = view.coordsAtPos(range.to)
  if (!start || !end) return null
  return {
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
    left: Math.min(start.left, end.left),
    right: Math.max(start.right, end.right),
  }
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  function MarkdownEditor(
    {
      initialContent,
      onContentChange,
      onSelectionChange,
      onSelectionCoords,
      onPendingRewriteDiscarded,
      mode = 'inplace',
      placeholder,
      className,
      height = 'min(70dvh, 36rem)',
    },
    ref,
  ) {
    const parentRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const modeCompartment = useRef(new Compartment())
    const modeRef = useRef<EditorMode>(mode)
    const logicalSelectionRef = useRef<EditorSelection | null>(null)
    const composingRef = useRef(false)

    const onContentChangeRef = useRef(onContentChange)
    const onSelectionChangeRef = useRef(onSelectionChange)
    const onSelectionCoordsRef = useRef(onSelectionCoords)
    const onPendingRewriteDiscardedRef = useRef(onPendingRewriteDiscarded)
    useLayoutEffect(() => {
      onContentChangeRef.current = onContentChange
      onSelectionChangeRef.current = onSelectionChange
      onSelectionCoordsRef.current = onSelectionCoords
      onPendingRewriteDiscardedRef.current = onPendingRewriteDiscarded
    })

    useEffect(() => {
      if (!parentRef.current) return

      const inplaceExt = modeCompartment.current.of(
        mode === 'inplace' ? buildInplaceExtensions() : [],
      )


      const emitCoords = (view: EditorView) => {
        onSelectionCoordsRef.current?.(readSelectionCoords(view))
      }

      const updateListener = EditorView.updateListener.of((update) => {
        const prevPending = update.startState.field(pendingRewriteField, false)
        const nextPending = update.state.field(pendingRewriteField, false)
        if (prevPending && !nextPending) {
          const fromUser = update.transactions.some((tr) => {
            if (!tr.docChanged) return false
            const source = tr.annotation(sourceAnnotation)
            return !source || source === 'user'
          })
          if (fromUser) onPendingRewriteDiscardedRef.current?.()
        }
        if (update.docChanged) {
          let source: TransactionSource = 'user'
          for (const tr of update.transactions) {
            const ann = tr.annotation(sourceAnnotation)
            if (ann) {
              source = ann
              break
            }
          }
          onContentChangeRef.current?.(update.state.doc.toString(), source)
        }
        if (update.selectionSet || update.docChanged) {
          const sel = readSelection(update.state)
          if (sel) logicalSelectionRef.current = sel
          onSelectionChangeRef.current?.(sel)
        }
        if (
          update.selectionSet ||
          update.docChanged ||
          update.geometryChanged ||
          update.viewportChanged
        ) {
          emitCoords(update.view)
        }
      })

      const view = new EditorView({
        state: EditorState.create({
          doc: initialContent,
          extensions: [
            ...buildBaseExtensions(placeholder),
            inplaceExt,
            updateListener,
            EditorView.domEventHandlers({
              compositionstart: () => {
                composingRef.current = true
              },
              compositionend: () => {
                composingRef.current = false
              },
            }),
          ],
        }),
        parent: parentRef.current,
      })
      viewRef.current = view
      modeRef.current = mode
      Object.defineProperty(parentRef.current, '__czGetContent', {
        configurable: true,
        value: () => view.state.doc.toString(),
      })

      return () => {
        view.destroy()
        viewRef.current = null
      }
      // Mount once; external doc updates go through MarkdownEditorHandle
    }, [])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      if (modeRef.current === mode) return
      modeRef.current = mode
      view.dispatch({
        effects: modeCompartment.current.reconfigure(
          mode === 'inplace' ? buildInplaceExtensions() : [],
        ),
      })
    }, [mode])

    useImperativeHandle(
      ref,
      (): MarkdownEditorHandle => ({
        getContent: () => viewRef.current?.state.doc.toString() ?? '',
        getSelection: () => {
          const view = viewRef.current
          if (!view) return null
          return readSelection(view.state)
        },
        getLogicalSelection: () => logicalSelectionRef.current,
        clearLogicalSelection: () => {
          logicalSelectionRef.current = null
        },
        getSelectionCoords: () => {
          const view = viewRef.current
          if (!view) return null
          return readSelectionCoords(view)
        },
        getRangeCoords: (from, to) => {
          const view = viewRef.current
          if (!view) return null
          const start = view.coordsAtPos(from)
          const end = view.coordsAtPos(to)
          if (!start || !end) return null
          return {
            top: Math.min(start.top, end.top),
            bottom: Math.max(start.bottom, end.bottom),
            left: Math.min(start.left, end.left),
            right: Math.max(start.right, end.right),
          }
        },
        setGeneratingRange: (range) => {
          const view = viewRef.current
          if (!view) return
          view.dispatch({
            effects: setGeneratingRangeEffect.of(range),
            selection: range ? { anchor: range.to } : undefined,
          })
        },
        setPendingRewrite: (input) => {
          const view = viewRef.current
          if (!view) return
          view.dispatch({
            effects: setPendingRewriteEffect.of(buildPendingRewrite(input)),
            selection: { anchor: input.to },
          })
        },
        clearPendingRewrite: () => {
          const view = viewRef.current
          if (!view) return
          if (!view.state.field(pendingRewriteField, false)) return
          view.dispatch({ effects: setPendingRewriteEffect.of(null) })
        },
        replaceRange: (change, options) => {
          const view = viewRef.current
          if (!view) return
          const source = options?.source ?? 'ai'
          const { from, to, insert } = change
          const selectResult = options?.selectResult ?? false
          const addToHistory = options?.addToHistory ?? source !== 'server'
          view.dispatch({
            changes: { from, to, insert },
            selection: selectResult
              ? { anchor: from, head: from + insert.length }
              : { anchor: from + insert.length },
            annotations: [
              sourceAnnotation.of(source),
              Transaction.addToHistory.of(addToHistory),
            ],
          })
        },
        replaceDocument: (content, options) => {
          const view = viewRef.current
          if (!view) return
          const source = options?.source ?? 'server'
          const addToHistory = options?.addToHistory ?? source !== 'server'
          const current = view.state.doc.toString()
          if (current === content) return
          view.dispatch({
            changes: { from: 0, to: current.length, insert: content },
            annotations: [
              sourceAnnotation.of(source),
              Transaction.addToHistory.of(addToHistory),
            ],
          })
        },
        setMode: (next) => {
          const view = viewRef.current
          if (!view) return
          modeRef.current = next
          view.dispatch({
            effects: modeCompartment.current.reconfigure(
              next === 'inplace' ? buildInplaceExtensions() : [],
            ),
          })
        },
        getMode: () => modeRef.current,
        setCursor: (pos) => {
          const view = viewRef.current
          if (!view) return
          const clamped = Math.max(0, Math.min(pos, view.state.doc.length))
          view.dispatch({ selection: { anchor: clamped } })
        },
        focus: () => viewRef.current?.focus(),
        undo: () => {
          const view = viewRef.current
          if (view) undo(view)
        },
        redo: () => {
          const view = viewRef.current
          if (view) redo(view)
        },
        isComposing: () => composingRef.current,
      }),
      [],
    )

    return (
      <div className={className}>
        <div
          ref={parentRef}
          className={
            mode === 'inplace' ? 'cm-shell cm-shell-article' : 'cm-shell'
          }
          style={{ height, minHeight: '16rem' }}
        />
      </div>
    )
  },
)
