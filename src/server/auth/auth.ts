import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { getPool } from '#/server/db/client.server'

export function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET or SESSION_SECRET is required')
  }

  const baseURL =
    process.env.BETTER_AUTH_URL ||
    process.env.APP_ORIGIN ||
    'http://localhost:3000'

  return betterAuth({
    database: getPool(),
    secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
      // Alpha is single-user; bootstrap via seed script only.
      disableSignUp: true,
    },
    trustedOrigins: [baseURL],
    plugins: [tanstackStartCookies()],
  })
}

const globalForAuth = globalThis as unknown as {
  __chengzhangAuth?: ReturnType<typeof createAuth>
}

export function getAuth() {
  if (!globalForAuth.__chengzhangAuth) {
    globalForAuth.__chengzhangAuth = createAuth()
  }
  return globalForAuth.__chengzhangAuth
}

// Lazy proxy so importing the module does not require env at build-analysis time
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop, receiver) {
    const instance = getAuth()
    const value = Reflect.get(instance, prop, receiver)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
