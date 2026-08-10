import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Do not override DATABASE_URL already set (e.g. Neon via setup-neon-db.sh).
config({ path: ['.env.local', '.env'], override: false })

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error('DATABASE_URL is required')
  }
  // Neon + newer pg: prefer libpq-compatible sslmode=require
  if (/\.neon\.tech/i.test(url) && !/uselibpqcompat=/i.test(url)) {
    return `${url}${url.includes('?') ? '&' : '?'}uselibpqcompat=true`
  }
  return url
}

export default defineConfig({
  out: './drizzle',
  schema: './src/server/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl(),
  },
  strict: true,
  verbose: true,
})

