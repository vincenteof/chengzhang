/**
 * Better Auth schema migrate using the project's better-auth package
 * (avoids flaky `pnpm dlx @better-auth/cli` against Neon).
 *
 * Prefer DATABASE_URL already in the environment (e.g. from setup-neon-db.sh).
 * Optionally loads scripts/neon-cloudflare.env without overriding existing vars.
 */
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMigrations } from 'better-auth/db/migration'
import { Pool } from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const neonEnv = path.join(root, 'scripts/neon-cloudflare.env')

if (existsSync(neonEnv)) {
  loadEnv({ path: neonEnv, override: false })
}
loadEnv({ path: path.join(root, '.env.local'), override: false })
loadEnv({ path: path.join(root, '.env'), override: false })

function neonFriendlyUrl(url: string): string {
  let u = url.trim()
  if (!/\.neon\.tech/i.test(u)) return u

  const join = u.includes('?') ? '&' : '?'
  if (!/sslmode=/i.test(u)) {
    u += `${join}sslmode=require`
  }
  // Align with upcoming pg/libpq semantics (see pg-connection-string warning).
  if (!/uselibpqcompat=/i.test(u)) {
    u += `${u.includes('?') ? '&' : '?'}uselibpqcompat=true`
  }
  return u
}

async function main() {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) {
    throw new Error(
      'DATABASE_URL is required (set env or fill scripts/neon-cloudflare.env)',
    )
  }
  if (raw.includes('pooler')) {
    console.warn(
      '警告: DATABASE_URL 含 pooler，migrate 建议改用 Neon Direct（无 -pooler）',
    )
  }

  const connectionString = neonFriendlyUrl(raw)
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
