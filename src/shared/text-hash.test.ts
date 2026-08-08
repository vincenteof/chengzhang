import { describe, expect, it } from 'vitest'

import { hashText } from './text-hash'

describe('hashText', () => {
  it('is stable for the same input', async () => {
    const a = await hashText('hello 成章')
    const b = await hashText('hello 成章')
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(8)
  })

  it('changes when text changes', async () => {
    const a = await hashText('a')
    const b = await hashText('b')
    expect(a).not.toBe(b)
  })
})
