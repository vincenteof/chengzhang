import { getRequest } from '@tanstack/react-start/server'
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

type RequestDbState = {
  pool: AnyPool
  db: Db
  key: string
}

/** Node process-wide cache (safe for long-lived servers, not for Workers). */
const nodeGlobal = globalThis as unknown as {
  __chengzhangNodeDb?: RequestDbState
}

/**
 * Cloudflare Workers forbid using I/O objects created in one request from
 * another request ("Cannot perform I/O on behalf of a different request").
 * Scope pool/db to the current Request via WeakMap.
 *
 * @see https://neon.tech/docs/serverless/serverless-driver
 */
const workerDbByRequest = new WeakMap<Request, RequestDbState>()

function isCloudflareWorkerRuntime(): boolean {
  return (
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

export function shouldUseNeonServerless(connectionString: string): boolean {
  return isCloudflareWorkerRuntime() && isNeonConnectionString(connectionString)
}

export function normalizeDatabaseUrl(connectionString: string): string {
  let raw = connectionString.trim()

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
  const max = isCloudflareWorkerRuntime()
    ? Math.min(1, resolveDbPoolMax())
    : resolveDbPoolMax()
  return new NeonPool({
    connectionString,
    max,
    connectionTimeoutMillis: Number.isFinite(timeout) ? timeout : 15_000,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
  })
}

function buildState(connectionString: string): RequestDbState {
  const driver = shouldUseNeonServerless(connectionString) ? 'neon' : 'pg'
  const key = `${driver}::${connectionString}::${resolveDbPoolMax()}`
  const pool =
    driver === 'neon'
      ? createNeonPool(connectionString)
      : createPgPool(connectionString)
  const db =
    driver === 'neon'
      ? drizzleNeon({ client: pool as NeonPool, schema })
      : drizzlePg({ client: pool as PgPool, schema })
  return { pool, db, key }
}

function tryGetRequest(): Request | null {
  try {
    return getRequest()
  } catch {
    return null
  }
}

function getOrCreateState(): RequestDbState {
  const connectionString = normalizeDatabaseUrl(resolveDatabaseUrl())

  if (isCloudflareWorkerRuntime()) {
    const request = tryGetRequest()
    if (request) {
      const existing = workerDbByRequest.get(request)
      if (existing) return existing
      const created = buildState(connectionString)
      workerDbByRequest.set(request, created)
      return created
    }
    // No request ALS: never reuse a cross-request global on Workers.
    return buildState(connectionString)
  }

  // Long-lived Node process: one pool for the process.
  const driver = shouldUseNeonServerless(connectionString) ? 'neon' : 'pg'
  const nodeKey = `${driver}::${connectionString}::${resolveDbPoolMax()}`
  if (nodeGlobal.__chengzhangNodeDb?.key === nodeKey) {
    return nodeGlobal.__chengzhangNodeDb
  }
  const previous = nodeGlobal.__chengzhangNodeDb
  nodeGlobal.__chengzhangNodeDb = buildState(connectionString)
  void previous?.pool.end().catch(() => {})
  return nodeGlobal.__chengzhangNodeDb
}

export function getPool(): AnyPool {
  return getOrCreateState().pool
}

export function getDb(): Db {
  return getOrCreateState().db
}

export type Db = ReturnType<typeof drizzlePg> | ReturnType<typeof drizzleNeon>
