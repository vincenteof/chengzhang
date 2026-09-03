import { describe, expect, it } from 'vitest'

import { normalizeDatabaseUrl } from './client.server'

describe('normalizeDatabaseUrl', () => {
  it('rewrites localhost to 127.0.0.1', () => {
    expect(normalizeDatabaseUrl('postgresql://u@localhost:5432/db')).toBe(
      'postgresql://u@127.0.0.1:5432/db',
    )
  })

  it('injects a user when the url has none', () => {
    const url = normalizeDatabaseUrl('postgresql://127.0.0.1:5432/db')
    expect(url).toMatch(/^postgresql:\/\/.+@127\.0\.0\.1:5432\/db$/)
  })
})
