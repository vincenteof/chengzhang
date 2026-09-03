import { exportDraftMarkdown } from '#/modules/drafts/drafts.service'
import {
  collectLocalMediaIds,
  localMediaExportPath,
  rewriteLocalMediaUrls,
} from '#/modules/export/local-media'
import { zipExportFolder } from '#/modules/export/zip'
import type { Db } from '#/server/db/client.server'
import { loadUploadedImage } from '#/server/media/media.service'
import { MEDIA_MIME } from '#/server/media/types'

export type ExportArtifact = {
  body: Uint8Array
  filename: string
  contentType: string
}

export async function exportDraftArtifact(
  db: Db,
  draftId: string,
): Promise<ExportArtifact> {
  const { markdown, filename } = await exportDraftMarkdown(db, draftId)
  const ids = collectLocalMediaIds(markdown)
  if (ids.length === 0) {
    return {
      body: new TextEncoder().encode(markdown),
      filename,
      contentType: 'text/markdown; charset=utf-8',
    }
  }

  const extById = new Map<string, string>()
  const media: Array<{ filename: string; bytes: Uint8Array }> = []

  for (const id of ids) {
    const object = await loadUploadedImage(id)
    if (!object) {
      throw Object.assign(new Error(`导出失败：找不到图片 ${id}`), {
        code: 'VALIDATION_ERROR',
      })
    }
    const ext = MEDIA_MIME[object.mime]
    if (!ext) {
      throw Object.assign(new Error(`导出失败：不支持的图片类型 ${id}`), {
        code: 'VALIDATION_ERROR',
      })
    }
    extById.set(id.toLowerCase(), ext)
    media.push({ filename: `${id}.${ext}`, bytes: object.bytes })
  }

  const rewritten = rewriteLocalMediaUrls(markdown, (id) => {
    const ext = extById.get(id.toLowerCase())
    if (!ext) return localMediaExportPath(id, 'bin')
    return localMediaExportPath(id, ext)
  })
  const stem = filename.replace(/\.md$/i, '')

  return {
    body: zipExportFolder({ stem, markdown: rewritten, media }),
    filename: `${stem}.zip`,
    contentType: 'application/zip',
  }
}

export function contentDisposition(filename: string): string {
  const ascii = Array.from(filename)
    .map((ch) => {
      const code = ch.charCodeAt(0)
      if (code < 32 || code > 126 || '"\\'.includes(ch)) return '_'
      return ch
    })
    .join('')
    .replace(/_+/g, '_')
  let fallback = ascii.replace(/^_+|_+$/g, '')
  if (!fallback || fallback === '.' || /^\.[a-z0-9]+$/i.test(fallback)) {
    const dot = filename.lastIndexOf('.')
    const ext = dot >= 0 ? filename.slice(dot).replace(/[^a-z0-9.]/gi, '') : ''
    fallback = `export${ext}`
  }
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
