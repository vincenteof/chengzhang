import YAML from 'yaml'

export type ExportMeta = {
  title: string
  description?: string | null
  slug?: string | null
  tags?: string[] | null
}

export function buildMarkdownDocument(meta: ExportMeta, content: string): string {
  const front: Record<string, unknown> = {
    title: meta.title,
  }

  if (meta.description?.trim()) {
    front.description = meta.description.trim()
  }
  if (meta.slug?.trim()) {
    front.slug = meta.slug.trim()
  }
  if (meta.tags && meta.tags.length > 0) {
    front.tags = meta.tags
  }

  const yaml = YAML.stringify(front, { lineWidth: 0 }).trimEnd()
  const body = content.replace(/^\uFEFF/, '')
  return `---\n${yaml}\n---\n\n${body.trimEnd()}\n`
}

export function safeFilename(meta: ExportMeta): string {
  const raw = meta.slug?.trim() || meta.title.trim() || 'draft'
  const cleaned = Array.from(raw)
    .map((ch) => {
      const code = ch.charCodeAt(0)
      if (code < 32 || '/\\:*?"<>|'.includes(ch)) return '-'
      return ch
    })
    .join('')

  return (
    cleaned
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'draft'
  )
}
