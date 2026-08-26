/** `createId('frag')` → frag_ + UUID. */
export const FRAGMENT_ID_RE =
  /\bfrag_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

export function isFragmentId(value: string): boolean {
  const re = new RegExp(`^${FRAGMENT_ID_RE.source}$`, 'i')
  return re.test(value.trim())
}

/** Remove machine fragment citations that should not appear in reader-facing prose. */
export function stripFragmentCitations(text: string): string {
  return text
    .replace(
      /[`【[]?\s*frag_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*[`\]】]?/gi,
      '',
    )
    .replace(
      /\[(?:其中一个|某一条|某条|某段|某个)?(?:对话片段|碎片|素材)[^\]]{0,24}\]/g,
      '',
    )
    .replace(/[（(]\s*[）)]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}
