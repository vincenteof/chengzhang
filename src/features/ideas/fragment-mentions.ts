import { FRAGMENT_ID_RE, isFragmentId } from '#/shared/fragment-id'

export { FRAGMENT_ID_RE, isFragmentId }

export type FragmentMentionToken =
  { kind: 'text'; value: string } | { kind: 'frag'; id: string }

export function splitFragmentMentions(text: string): FragmentMentionToken[] {
  const tokens: FragmentMentionToken[] = []
  const re = new RegExp(FRAGMENT_ID_RE.source, 'gi')
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (match.index > last) {
      tokens.push({ kind: 'text', value: text.slice(last, match.index) })
    }
    tokens.push({ kind: 'frag', id: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    tokens.push({ kind: 'text', value: text.slice(last) })
  }
  return tokens.length > 0 ? tokens : [{ kind: 'text', value: text }]
}

export function fragmentSnippet(content: string, max = 12): string {
  const line = content.trim().split('\n')[0] ?? ''
  if (!line) return '碎片'
  return line.length <= max ? line : `${line.slice(0, max)}…`
}
