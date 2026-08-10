import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { Pool as NeonPool } from '@neondatabase/serverless'
import { Pool as PgPool } from 'pg'

import {
  resolveDatabaseUrl,
  resolveDbPoolMax,
} from '#/server/cloudflare-env.server'
import * as schema from './schema'

type AnyPool = PgPool | NeonPool

const globalForDb = globalThis as unknown as {
  __chengzhangPool?: AnyPool
  __chengzhangPoolKey?: string
  __chengzhangDb?: Db
  __chengzhangDbKey?: string
}

/**
 * Cloudflare Workers cannot reliably open outbound TCP to Neon with node-pg
 * (Better Auth log: "timeout exceeded when trying to connect").
 * On the Worker runtime, use Neon's serverless driver (WebSocket/HTTP).
 * Local Node + local Postgres keeps node-pg.
 *
 * @see https://neon.tech/docs/serverless/serverless-driver
 * @see https://developers.cloudflare.com/hyperdrive/ (alt: Hyperdrive + pg)
 */
function isCloudflareWorkerRuntime(): boolean {
  return (
    // workerd exposes WebSocketPair
    typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair ===
      'function' ||
    (typeof navigator !== 'undefined' &&
      typeof navigator.userAgent === 'string' &&
      navigator.userAgent.includes('Cloudflare-Workers'))
  )
}

function isNeonConnectionString(url: string): boolean {
  return /\.neon\.tech/i.test(url)
}

/** Prefer Neon serverless whenever the app runs on Workers against Neon. */
export function shouldUseNeonServerless(connectionString: string): boolean {
  return isCloudflareWorkerRuntime() && isNeonConnectionString(connectionString)
}

/**
 * Normalize connection strings for local Node / workerd edge cases.
 * Does not change Neon hostnames (pooler vs direct is the operator's choice).
 */
export function normalizeDatabaseUrl(connectionString: string): string {
  let raw = connectionString.trim()

  // Prefer IPv4 loopback for local Postgres (avoids ::1 hang in workerd dev).
  raw = raw.replace(
    /^(postgres(?:ql)?:\/\/[^/]*@)localhost(?=[:/]|$)/i,
    '$1127.0.0.1',
  )
  raw = raw.replace(
    /^(postgres(?:ql)?:\/\/)localhost(?=[:/]|$)/i,
    '$1127.0.0.1',
  )

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

  if (isNeonConnectionString(raw)) {
    if (!/sslmode=/i.test(raw)) {
      raw += `${raw.includes('?') ? '&' : '?'}sslmode=require`
    }
    // Only needed for node-pg path; harmless on serverless driver.
    if (!/uselibpqcompat=/i.test(raw) && !isCloudflareWorkerRuntime()) {
      raw += `${raw.includes('?') ? '&' : '?'}uselibpqcompat=true`
    }
  }

  return raw
}

function createPgPool(connectionString: string): PgPool {
  const timeout = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10_000)
  return new PgPool({
    connectionString,
    max: resolveDbPoolMax(),
    connectionTimeoutMillis: Number.isFinite(timeout) ? timeout : 10_000,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
    allowExitOnIdle: true,
  })
}

function createNeonPool(connectionString: string): NeonPool {
  const timeout = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 15_000)
  return new NeonPool({
    connectionString,
    max: resolveDbPoolMax(),
    connectionTimeoutMillis: Number.isFinite(timeout) ? timeout : 15_000,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
  })
}

export function getPool(): AnyPool {
  const connectionString = normalizeDatabaseUrl(resolveDatabaseUrl())
  const driver = shouldUseNeonServerless(connectionString) ? 'neon' : 'pg'
  const key = `${driver}::${connectionString}::${resolveDbPoolMax()}`

  if (
    !globalForDb.__chengzhangPool ||
    globalForDb.__chengzhangPoolKey !== key
  ) {
    const previous = globalForDb.__chengzhangPool
    globalForDb.__chengzhangPool =
      driver === 'neon'
        ? createNeonPool(connectionString)
        : createPgPool(connectionString)
    globalForDb.__chengzhangPoolKey = key
    globalForDb.__chengzhangDb = undefined
    globalForDb.__chengzhangDbKey = undefined
    void previous?.end().catch(() => {})
  }

  return globalForDb.__chengzhangPool
}

export function getDb() {
  const pool = getPool()
  const connectionString = normalizeDatabaseUrl(resolveDatabaseUrl())
  const driver = shouldUseNeonServerless(connectionString) ? 'neon' : 'pg'
  const key = `${driver}::${connectionString}::${resolveDbPoolMax()}`

  if (!globalForDb.__chengzhangDb || globalForDb.__chengzhangDbKey !== key) {
    globalForDb.__chengzhangDb =
      driver === 'neon'
        ? drizzleNeon({ client: pool as NeonPool, schema })
        : drizzlePg({ client: pool as PgPool, schema })
    globalForDb.__chengzhangDbKey = key
  }

  return globalForDb.__chengzhangDb
}

export type Db = ReturnType<typeof drizzlePg> | ReturnType<typeof drizzleNeon>
