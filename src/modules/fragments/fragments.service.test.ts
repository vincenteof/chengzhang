import { describe, expect, it } from 'vitest'

import { createId } from '#/shared/ids'

describe('fragment helpers', () => {
  it('creates stable capture ids', () => {
    const a = createId('cap')
    const b = createId('cap')
    expect(a).not.toEqual(b)
    expect(a.startsWith('cap_')).toBe(true)
  })
})
