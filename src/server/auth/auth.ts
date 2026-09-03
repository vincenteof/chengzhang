import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { getPool } from '#/server/db/client.server'

type AuthInstance = ReturnType<typeof createAuth>

const nodeGlobal = globalThis as unknown as {
  __chengzhangAuth?: AuthInstance
}

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
      disableSignUp: true,
    },
    trustedOrigins: [baseURL],
    plugins: [tanstackStartCookies()],
  })
}

export function getAuth() {
  if (!nodeGlobal.__chengzhangAuth) {
    nodeGlobal.__chengzhangAuth = createAuth()
  }
  return nodeGlobal.__chengzhangAuth
}

export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    const instance = getAuth()
    const value = Reflect.get(instance, prop, receiver)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
