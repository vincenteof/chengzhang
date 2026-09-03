import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { resolveDatabaseUrl, resolveDbPoolMax } from '#/server/env.server'
import * as schema from './schema'

type RequestDbState = {
  pool: Pool
  db: Db
  key: string
}

const nodeGlobal = globalThis as unknown as {
  __chengzhangNodeDb?: RequestDbState
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

  return raw
}

function createPgPool(connectionString: string): Pool {
  const timeout = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10_000)
  return new Pool({
    connectionString,
    max: resolveDbPoolMax(),
    connectionTimeoutMillis: Number.isFinite(timeout) ? timeout : 10_000,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
  })
}

function buildState(connectionString: string): RequestDbState {
  const pool = createPgPool(connectionString)
  const db = drizzle({ client: pool, schema })
  return {
    pool,
    db,
    key: `pg::${connectionString}::${resolveDbPoolMax()}`,
  }
}

function getOrCreateState(): RequestDbState {
  const connectionString = normalizeDatabaseUrl(resolveDatabaseUrl())
  const nodeKey = `pg::${connectionString}::${resolveDbPoolMax()}`
  if (nodeGlobal.__chengzhangNodeDb?.key === nodeKey) {
    return nodeGlobal.__chengzhangNodeDb
  }
  const previous = nodeGlobal.__chengzhangNodeDb
  nodeGlobal.__chengzhangNodeDb = buildState(connectionString)
  void previous?.pool.end().catch(() => {})
  return nodeGlobal.__chengzhangNodeDb
}

export function getPool(): Pool {
  return getOrCreateState().pool
}

export function getDb(): Db {
  return getOrCreateState().db
}

export type Db = ReturnType<typeof drizzle>
