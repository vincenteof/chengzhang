export type FragmentBlock = {
  id: string
  content: string
  createdAt: string
}

export function serializeFragments(fragments: FragmentBlock[]): string {
  if (fragments.length === 0) return '（无碎片）'
  return fragments
    .map(
      (f) =>
        `<fragment id="${escapeXml(f.id)}" created_at="${escapeXml(f.createdAt)}">\n${f.content}\n</fragment>`,
    )
    .join('\n\n')
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function validateFragmentRefs(
  allowedIds: Set<string>,
  refs: string[],
): string[] {
  return refs.filter((id) => !allowedIds.has(id))
}
