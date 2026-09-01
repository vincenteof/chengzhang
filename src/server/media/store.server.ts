import { asWorkerEnv } from '#/server/cloudflare-env.server'
import type { MediaMime } from './types'

export type MediaObject = {
  bytes: Uint8Array
  mime: MediaMime
}

function r2Bucket() {
  return asWorkerEnv().MEDIA ?? null
}

export async function putMediaObject(
  id: string,
  bytes: Uint8Array,
  mime: MediaMime,
): Promise<void> {
  const bucket = r2Bucket()
  if (bucket) {
    await bucket.put(id, bytes, { httpMetadata: { contentType: mime } })
    return
  }

  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const dir = join(process.cwd(), '.tmp/media')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, id), bytes)
  await writeFile(join(dir, `${id}.mime`), mime, 'utf8')
}

export async function getMediaObject(id: string): Promise<MediaObject | null> {
  const bucket = r2Bucket()
  if (bucket) {
    const object = await bucket.get(id)
    if (!object) return null
    const mime = (object.httpMetadata?.contentType || 'image/jpeg') as MediaMime
    const bytes = new Uint8Array(await object.arrayBuffer())
    return { bytes, mime }
  }

  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const dir = join(process.cwd(), '.tmp/media')
  try {
    const bytes = new Uint8Array(await readFile(join(dir, id)))
    const mime = (
      await readFile(join(dir, `${id}.mime`), 'utf8')
    ).trim() as MediaMime
    return { bytes, mime }
  } catch {
    return null
  }
}
