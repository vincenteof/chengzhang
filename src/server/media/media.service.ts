import { createId } from '#/shared/ids'

import { getMediaObject, putMediaObject } from './store.server'
import type { MediaMime } from './types'
import {
  MEDIA_MAX_BYTES,
  MEDIA_MIME,
  altFromFilename,
  sniffMediaMime,
} from './types'

export { MEDIA_MAX_BYTES, altFromFilename, sniffMediaMime }

export function isMediaMime(value: string): value is MediaMime {
  return value in MEDIA_MIME
}

export async function saveUploadedImage(input: {
  bytes: Uint8Array
  filename: string
  declaredType?: string
}): Promise<{ id: string; url: string; alt: string; mime: MediaMime }> {
  if (input.bytes.byteLength === 0) {
    throw Object.assign(new Error('空文件'), { code: 'VALIDATION_ERROR' })
  }
  if (input.bytes.byteLength > MEDIA_MAX_BYTES) {
    throw Object.assign(new Error('图片不能超过 8 MB'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const sniffed = sniffMediaMime(input.bytes)
  const declared =
    input.declaredType && isMediaMime(input.declaredType)
      ? input.declaredType
      : null
  const mime = sniffed ?? declared
  if (!mime) {
    throw Object.assign(new Error('只支持 jpeg、png、webp、gif'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const id = createId('img')
  await putMediaObject(id, input.bytes, mime)
  return {
    id,
    url: `/api/media/${id}`,
    alt: altFromFilename(input.filename),
    mime,
  }
}

export async function loadUploadedImage(id: string) {
  if (!/^img_[0-9a-f-]{20,}$/i.test(id)) return null
  return getMediaObject(id)
}
