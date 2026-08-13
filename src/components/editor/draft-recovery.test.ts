/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest'

import {
  clearDraftRecovery,
  readDraftRecovery,
  recoveryDiffersFromServer,
  writeDraftRecovery,
} from './draft-recovery'

describe('draft-recovery', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes and reads recovery payload', () => {
    writeDraftRecovery({
      draftId: 'draft_1',
      baseRevision: 3,
      title: 'T',
      content: '# hi',
      savedAt: '2026-01-01T00:00:00.000Z',
    })
    const r = readDraftRecovery('draft_1')
    expect(r?.content).toBe('# hi')
    expect(r?.baseRevision).toBe(3)
  })

  it('detects difference from server', () => {
    const recovery = {
      draftId: 'draft_1',
      baseRevision: 2,
      title: 'A',
      content: 'local',
      savedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(
      recoveryDiffersFromServer(recovery, {
        title: 'A',
        content: 'server',
        revision: 2,
      }),
    ).toBe(true)
    expect(
      recoveryDiffersFromServer(recovery, {
        title: 'A',
        content: 'local',
        revision: 2,
      }),
    ).toBe(false)
  })

  it('clears recovery', () => {
    writeDraftRecovery({
      draftId: 'draft_1',
      baseRevision: 1,
      title: 'T',
      content: 'x',
      savedAt: '2026-01-01T00:00:00.000Z',
    })
    clearDraftRecovery('draft_1')
    expect(readDraftRecovery('draft_1')).toBeNull()
  })
})
