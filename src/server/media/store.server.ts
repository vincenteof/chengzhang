import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveMediaDir } from '#/server/env.server'
import type { MediaMime } from './types'

export type MediaObject = {
  bytes: Uint8Array
  mime: MediaMime
}

export async function putMediaObject(
  id: string,
  bytes: Uint8Array,
  mime: MediaMime,
): Promise<void> {
  const dir = resolveMediaDir()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, id), bytes)
  await writeFile(join(dir, `${id}.mime`), mime, 'utf8')
}

export async function getMediaObject(id: string): Promise<MediaObject | null> {
  const dir = resolveMediaDir()
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
