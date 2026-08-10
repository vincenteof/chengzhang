import { createServerFn } from '@tanstack/react-start'
import {
  getRequestHeader,
  getRequestHeaders,
  setCookie,
  deleteCookie,
} from '@tanstack/react-start/server'
import { z } from 'zod'

import { getAuth } from '#/server/auth/auth'
import {
  checkLoginRateLimit,
  clearLoginFailures,
  getLoginRateLimitKey,
  recordLoginFailure,
} from '#/server/auth/rate-limit.server'
import { getSession } from '#/server/auth/session.server'
import { isRetryable } from '#/shared/errors'
import { createId } from '#/shared/ids'
import type { AppResult } from '#/shared/result'
import { err, ok } from '#/shared/result'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function clientKeyFromRequest() {
  return (
    getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ||
    getRequestHeader('x-real-ip') ||
    'local'
  )
}

/** Apply Set-Cookie headers from a fetch Response onto the TanStack Start response. */
function applySetCookiesFromResponse(response: Response) {
  const headersWithGetSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[]
  }
  const rawCookies =
    typeof headersWithGetSetCookie.getSetCookie === 'function'
      ? headersWithGetSetCookie.getSetCookie()
      : (() => {
          const single = response.headers.get('set-cookie')
          return single ? [single] : []
        })()

  for (const raw of rawCookies) {
    const parts = raw.split(';').map((p) => p.trim())
    const [nameValue, ...attrs] = parts
    if (!nameValue) continue
    const eq = nameValue.indexOf('=')
    if (eq <= 0) continue
    const name = nameValue.slice(0, eq).trim()
    let value = nameValue.slice(eq + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      // keep raw value
    }

    const options: {
      path?: string
      maxAge?: number
      httpOnly?: boolean
      secure?: boolean
      sameSite?: boolean | 'lax' | 'strict' | 'none'
    } = {}

    for (const attr of attrs) {
      const [k, v] = attr.split('=').map((s) => s.trim())
      const key = k.toLowerCase()
      if (key === 'path' && v) options.path = v
      else if (key === 'max-age' && v) options.maxAge = Number(v)
      else if (key === 'httponly') options.httpOnly = true
      else if (key === 'secure') options.secure = true
      else if (key === 'samesite' && v) {
        const s = v.toLowerCase()
        if (s === 'lax' || s === 'strict' || s === 'none') options.sameSite = s
      }
    }

    setCookie(name, value, options)
  }
}

export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<
    AppResult<{ user: { id: string; email: string; name: string } | null }>
  > => {
    const requestId = createId('req')
    try {
      const session = await getSession()
      if (!session?.user) {
        return ok({ user: null })
      }
      return ok({
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name || session.user.email,
        },
      })
    } catch {
      return err({
        code: 'INTERNAL_ERROR',
        message: '无法读取会话',
        retryable: true,
        requestId,
      })
    }
  },
)

/**
 * Login via Better Auth, then explicitly copy Set-Cookie onto the Start
 * response. Relying only on tanstackStartCookies is unreliable on Cloudflare
 * Workers (plugin uses Headers.get('set-cookie') and swallows setCookie errors).
 */
export const loginFn = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(async ({ data }): Promise<AppResult<{ email: string }>> => {
    const requestId = createId('req')
    const email = data.email.trim().toLowerCase()
    const allowed = process.env.AUTH_ALLOWED_EMAIL?.trim().toLowerCase()
    const key = getLoginRateLimitKey(email, clientKeyFromRequest())
    const limit = checkLoginRateLimit(key)

    if (!limit.allowed) {
      return err({
        code: 'RATE_LIMITED',
        message: '登录失败次数过多，请稍后重试',
        retryable: true,
        requestId,
        details: {
          retryAfterMs: limit.retryAfterMs,
        },
      })
    }

    // Do not reveal whether the account exists.
    if (allowed && email !== allowed) {
      recordLoginFailure(key)
      return err({
        code: 'UNAUTHORIZED',
        message: '邮箱或密码不正确',
        retryable: false,
        requestId,
      })
    }

    try {
      const auth = getAuth()
      const response = await auth.api.signInEmail({
        body: {
          email,
          password: data.password,
        },
        headers: getRequestHeaders(),
        asResponse: true,
      })

      if (!response.ok) {
        recordLoginFailure(key)
        return err({
          code: 'UNAUTHORIZED',
          message: '邮箱或密码不正确',
          retryable: false,
          requestId,
        })
      }

      applySetCookiesFromResponse(response)
      clearLoginFailures(key)
      return ok({ email })
    } catch (error) {
      console.error('[auth] login failed', error)
      recordLoginFailure(key)
      return err({
        code: 'UNAUTHORIZED',
        message: '邮箱或密码不正确',
        retryable: isRetryable('UNAUTHORIZED'),
        requestId,
      })
    }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<AppResult<{ ok: true }>> => {
    const requestId = createId('req')
    try {
      const auth = getAuth()
      const response = await auth.api.signOut({
        headers: getRequestHeaders(),
        asResponse: true,
      })
      if (response instanceof Response) {
        applySetCookiesFromResponse(response)
      }
      // Ensure session cookie is cleared even if plugin omitted it
      deleteCookie('__Secure-better-auth.session_token', {
        path: '/',
        secure: true,
      })
      deleteCookie('better-auth.session_token', { path: '/' })
      return ok({ ok: true })
    } catch {
      return err({
        code: 'INTERNAL_ERROR',
        message: '退出失败',
        retryable: true,
        requestId,
      })
    }
  },
)
