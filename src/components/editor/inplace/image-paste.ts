import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { createId } from '#/shared/ids'

import { sourceAnnotation } from './source-annotation'

function isImageFile(file: File) {
  return (
    file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name)
  )
}

function filesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  return [...data.files].filter(isImageFile)
}

async function uploadImage(file: File): Promise<{ url: string; alt: string }> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch('/api/media', {
    method: 'POST',
    credentials: 'same-origin',
    body,
  })
  const payload = (await response.json().catch(() => null)) as {
    url?: string
    alt?: string
    message?: string
  } | null
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.message || '图片上传失败')
  }
  return { url: payload.url, alt: payload.alt || '图片' }
}

function insertToken(view: EditorView, token: string) {
  const from = view.state.selection.main.from
  const before = from === 0 ? '' : view.state.doc.sliceString(from - 1, from)
  const insert =
    before === '' || before === '\n' ? `${token}\n` : `\n${token}\n`
  view.dispatch({
    changes: { from, insert },
    selection: { anchor: from + insert.length },
    annotations: sourceAnnotation.of('user'),
    scrollIntoView: true,
  })
}

function replaceToken(view: EditorView, token: string, next: string) {
  const doc = view.state.doc.toString()
  const index = doc.indexOf(token)
  if (index < 0) return
  view.dispatch({
    changes: { from: index, to: index + token.length, insert: next },
    annotations: sourceAnnotation.of('user'),
  })
}

async function insertImages(view: EditorView, files: File[]) {
  for (const file of files) {
    const token = `![上传中](uploading:${createId('up')})`
    insertToken(view, token)
    try {
      const saved = await uploadImage(file)
      replaceToken(view, token, `![${saved.alt}](${saved.url})`)
    } catch (error) {
      replaceToken(view, token, '')
      console.error('[editor] image upload failed', error)
    }
  }
}

export function imagePasteDrop(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = filesFrom(event.clipboardData)
      if (files.length === 0) return false
      event.preventDefault()
      void insertImages(view, files)
      return true
    },
    drop(event, view) {
      const files = filesFrom(event.dataTransfer)
      if (files.length === 0) return false
      event.preventDefault()
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos != null) {
        view.dispatch({ selection: { anchor: pos } })
      }
      void insertImages(view, files)
      return true
    },
  })
}
