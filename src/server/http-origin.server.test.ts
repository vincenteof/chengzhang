import { afterEach, describe, expect, it } from 'vitest'

import { isAllowedBrowserOrigin } from './http-origin.server'

describe('isAllowedBrowserOrigin', () => {
  const prevOrigin = process.env.APP_ORIGIN
  const prevAuth = process.env.BETTER_AUTH_URL
  const prevNode = process.env.NODE_ENV

  afterEach(() => {
    process.env.APP_ORIGIN = prevOrigin
    process.env.BETTER_AUTH_URL = prevAuth
    process.env.NODE_ENV = prevNode
  })

  it('allows localhost on another port', () => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.NODE_ENV = 'production'
    const request = new Request('http://localhost:3001/api/x', {
      headers: { origin: 'http://localhost:3001' },
    })
    expect(isAllowedBrowserOrigin(request)).toBe(true)
  })

  it('allows 127.0.0.1 against localhost', () => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    const request = new Request('http://127.0.0.1:3001/api/x', {
      headers: { origin: 'http://127.0.0.1:3001' },
    })
    expect(isAllowedBrowserOrigin(request)).toBe(true)
  })
})
