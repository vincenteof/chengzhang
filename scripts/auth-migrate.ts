/**
 * Better Auth schema migrate using the project's better-auth package.
 */
import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMigrations } from 'better-auth/db/migration'
import { Pool } from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

loadEnv({ path: path.join(root, '.env.local'), override: false })
loadEnv({ path: path.join(root, '.env'), override: false })

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  const host = connectionString.match(/@([^/?]+)/)?.[1] ?? '?'
  console.log(`auth:migrate → ${host}`)

  const secret =
    process.env.BETTER_AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    'migrate-only-placeholder-secret-not-for-production'
  const baseURL =
    process.env.BETTER_AUTH_URL ||
    process.env.APP_ORIGIN ||
    'http://localhost:3000'

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 20_000,
  })

  try {
    const ping = await pool.query('select 1 as ok')
    console.log('db ping', ping.rows[0])

    const migrations = await getMigrations({
      database: pool,
      secret,
      baseURL,
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
      },
      trustedOrigins: [baseURL],
    })

    const createCount = migrations.toBeCreated.length
    const addCount = migrations.toBeAdded.length
    console.log(
      `pending: create ${createCount} table(s), add columns on ${addCount} table(s)`,
    )

    if (createCount === 0 && addCount === 0) {
      console.log('auth tables already up to date')
      return
    }

    await migrations.runMigrations()
    console.log('auth migrations applied')
  } finally {
    await pool.end().catch(() => {})
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
