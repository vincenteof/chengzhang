export type DraftRecovery = {
  draftId: string
  baseRevision: number
  title: string
  content: string
  savedAt: string
}

const PREFIX = 'chengzhang:draft-recovery:'

function key(draftId: string) {
  return `${PREFIX}${draftId}`
}

export function readDraftRecovery(draftId: string): DraftRecovery | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key(draftId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftRecovery
    if (
      !parsed ||
      parsed.draftId !== draftId ||
      typeof parsed.content !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.baseRevision !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeDraftRecovery(input: DraftRecovery): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key(input.draftId), JSON.stringify(input))
  } catch {
    // quota / private mode — ignore
  }
}

export function clearDraftRecovery(draftId: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(key(draftId))
  } catch {
    // ignore
  }
}

export function recoveryDiffersFromServer(
  recovery: DraftRecovery,
  server: { title: string; content: string; revision: number },
): boolean {
  return (
    recovery.content !== server.content ||
    recovery.title !== server.title ||
    recovery.baseRevision !== server.revision
  )
}
