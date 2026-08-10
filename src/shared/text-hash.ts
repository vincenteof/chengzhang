/** Stable short hash for selection stale checks (browser + server). */
export async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)
  }
  // Fallback for rare environments without subtle
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  }
  return `fallback_${(h >>> 0).toString(16)}`
}
