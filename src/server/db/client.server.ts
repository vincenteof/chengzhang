import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import {
  resolveDatabaseUrl,
  resolveDbPoolMax,
} from '#/server/cloudflare-env.server'
import * as schema from './schema'

const globalForDb = globalThis as unknown as {
  __chengzhangPool?: Pool
  __chengzhangPoolKey?: string
}

/**
 * Workerd does not peer-auth like local Node, and `localhost` may resolve to
 * IPv6 (::1) which often hangs inside miniflare. Normalize for both runtimes.
 */
export function normalizeDatabaseUrl(connectionString: string): string {
  let raw = connectionString.trim()

  // Prefer IPv4 loopback for local Postgres (avoids ::1 hang in workerd).
  raw = raw.replace(
    /^(postgres(?:ql)?:\/\/[^/]*@)localhost(?=[:/]|$)/i,
    '$1127.0.0.1',
  )
  raw = raw.replace(
    /^(postgres(?:ql)?:\/\/)localhost(?=[:/]|$)/i,
    '$1127.0.0.1',
  )

  // Already has userinfo (user or user:pass before host)
  if (!/^postgres(?:ql)?:\/\/[^/?#]*@/i.test(raw)) {
    const user =
      process.env.PGUSER?.trim() ||
      process.env.USER?.trim() ||
      process.env.LOGNAME?.trim() ||
      'postgres'
    raw = raw.replace(
      /^(postgres(?:ql)?:\/\/)/i,
      `$1${encodeURIComponent(user)}@`,
    )
  }

  // Neon + pg 8.x SSL mode warning / reconnect stability
  if (/\.neon\.tech/i.test(raw)) {
    if (!/sslmode=/i.test(raw)) {
      raw += `${raw.includes('?') ? '&' : '?'}sslmode=require`
    }
    if (!/uselibpqcompat=/i.test(raw)) {
      raw += `${raw.includes('?') ? '&' : '?'}uselibpqcompat=true`
    }
  }

  return raw
}

function createPool(connectionString: string) {
  const timeout = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5_000)
  return new Pool({
    connectionString: normalizeDatabaseUrl(connectionString),
    max: resolveDbPoolMax(),
    connectionTimeoutMillis: Number.isFinite(timeout) ? timeout : 5_000,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
    allowExitOnIdle: true,
  })
}

export function getPool() {
  const connectionString = resolveDatabaseUrl()
  const key = `${normalizeDatabaseUrl(connectionString)}::${resolveDbPoolMax()}`

  if (
    !globalForDb.__chengzhangPool ||
    globalForDb.__chengzhangPoolKey !== key
  ) {
    const previous = globalForDb.__chengzhangPool
    globalForDb.__chengzhangPool = createPool(connectionString)
    globalForDb.__chengzhangPoolKey = key
    void previous?.end().catch(() => {})
  }

  return globalForDb.__chengzhangPool
}

export function getDb() {
  return drizzle(getPool(), { schema })
}

export type Db = ReturnType<typeof getDb>
