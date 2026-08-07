import { createServerFn } from '@tanstack/react-start'
import {
  getRequestHeader,
  getRequestHeaders,
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
      await auth.api.signInEmail({
        body: {
          email,
          password: data.password,
        },
        headers: getRequestHeaders(),
      })
      clearLoginFailures(key)
      return ok({ email })
    } catch {
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
      await auth.api.signOut({
        headers: getRequestHeaders(),
      })
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
