import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getRequest } from '@tanstack/react-start/server'

import { getPool } from '#/server/db/client.server'

type AuthInstance = ReturnType<typeof createAuth>

/** Node-only singleton. Never reuse auth (and its pool) across Worker requests. */
const nodeGlobal = globalThis as unknown as {
  __chengzhangAuth?: AuthInstance
}

const workerAuthByRequest = new WeakMap<Request, AuthInstance>()

function isCloudflareWorkerRuntime(): boolean {
  return (
    typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair ===
      'function' ||
    (typeof navigator !== 'undefined' &&
      typeof navigator.userAgent === 'string' &&
      navigator.userAgent.includes('Cloudflare-Workers'))
  )
}

function tryGetRequest(): Request | null {
  try {
    return getRequest()
  } catch {
    return null
  }
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
    // getPool() is request-scoped on Workers.
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
  if (isCloudflareWorkerRuntime()) {
    const request = tryGetRequest()
    if (request) {
      const existing = workerAuthByRequest.get(request)
      if (existing) return existing
      const created = createAuth()
      workerAuthByRequest.set(request, created)
      return created
    }
    return createAuth()
  }

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
