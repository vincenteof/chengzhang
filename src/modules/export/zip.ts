import { strToU8, zipSync } from 'fflate'

export type ZipMediaFile = {
  filename: string
  bytes: Uint8Array
}

/** `{stem}/{stem}.md` plus `{stem}/media/...` so unzipping yields one folder. */
export function zipExportFolder(input: {
  stem: string
  markdown: string
  media: ZipMediaFile[]
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [`${input.stem}/${input.stem}.md`]: strToU8(input.markdown),
  }
  for (const file of input.media) {
    files[`${input.stem}/media/${file.filename}`] = file.bytes
  }
  return zipSync(files, { level: 6 })
}
