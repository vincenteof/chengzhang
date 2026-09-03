/** Matches in-app uploads, including optional origin prefix. */
const LOCAL_MEDIA_SRC_RE =
  /(?:https?:\/\/[^/\s)"']+)?\/api\/media\/(img_[0-9a-f-]{20,})/gi

export function collectLocalMediaIds(markdown: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of markdown.matchAll(new RegExp(LOCAL_MEDIA_SRC_RE, 'gi'))) {
    const id = match[1]
    if (!id) continue
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ids.push(id)
  }
  return ids
}

export function localMediaExportPath(id: string, ext: string): string {
  return `./media/${id}.${ext}`
}

export function rewriteLocalMediaUrls(
  markdown: string,
  pathForId: (id: string) => string,
): string {
  return markdown.replace(
    new RegExp(LOCAL_MEDIA_SRC_RE, 'gi'),
    (_all, id: string) => pathForId(id),
  )
}
