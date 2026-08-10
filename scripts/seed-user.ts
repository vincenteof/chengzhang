import { config } from 'dotenv'
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

// Keep DATABASE_URL from caller (e.g. Neon setup); do not clobber with .env.local.
config({ path: ['.env.local', '.env'], override: false })

/**
 * Bootstrap the single Alpha user. Runtime sign-up stays disabled;
 * this script uses a temporary auth instance with sign-up enabled.
 */

async function main() {
  const url = process.env.DATABASE_URL
  const email = process.env.AUTH_ALLOWED_EMAIL
  const password = process.env.AUTH_PASSWORD
  const name = process.env.AUTH_NAME || 'Author'
  const secret = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET
  const baseURL =
    process.env.BETTER_AUTH_URL ||
    process.env.APP_ORIGIN ||
    'http://localhost:3000'

  if (!url || !email || !password || !secret) {
    throw new Error(
      'DATABASE_URL, AUTH_ALLOWED_EMAIL, AUTH_PASSWORD, and BETTER_AUTH_SECRET are required',
    )
  }

  const pool = new Pool({ connectionString: url })
  const auth = betterAuth({
    database: pool,
    secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
    },
  })

  try {
    await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    })
    console.log(`Seeded user: ${email}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/already|exists|unique/i.test(message)) {
      console.log(`User already exists: ${email}`)
    } else {
      // better-auth may throw differently when user exists
      console.log(`Seed attempt finished (${message}). Verifying…`)
      const existing = await pool.query(
        'select id, email from "user" where email = $1 limit 1',
        [email],
      )
      if (existing.rowCount && existing.rowCount > 0) {
        console.log(`User already exists: ${email}`)
      } else {
        throw error
      }
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
