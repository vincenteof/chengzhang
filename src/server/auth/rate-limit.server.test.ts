import { beforeEach, describe, expect, it } from 'vitest'

import {
  __resetLoginRateLimitForTests,
  checkLoginRateLimit,
  recordLoginFailure,
} from './rate-limit.server'

describe('login rate limit', () => {
  beforeEach(() => {
    __resetLoginRateLimitForTests()
    process.env.AUTH_LOGIN_MAX_FAILURES = '3'
    process.env.AUTH_LOGIN_WINDOW_MS = '60000'
  })

  it('allows under the threshold and blocks after max failures', () => {
    const key = 'user@example.com|127.0.0.1'
    expect(checkLoginRateLimit(key).allowed).toBe(true)

    recordLoginFailure(key)
    recordLoginFailure(key)
    expect(checkLoginRateLimit(key).allowed).toBe(true)

    recordLoginFailure(key)
    const limited = checkLoginRateLimit(key)
    expect(limited.allowed).toBe(false)
    expect(limited.retryAfterMs).toBeGreaterThan(0)
  })
})
