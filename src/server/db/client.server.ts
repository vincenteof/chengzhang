import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

const globalForDb = globalThis as unknown as {
  __chengzhangPool?: Pool
}

function createPool() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is required')
  }

  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 10),
  })
}

export function getPool() {
  if (!globalForDb.__chengzhangPool) {
    globalForDb.__chengzhangPool = createPool()
  }
  return globalForDb.__chengzhangPool
}

export function getDb() {
  return drizzle(getPool(), { schema })
}

export type Db = ReturnType<typeof getDb>
