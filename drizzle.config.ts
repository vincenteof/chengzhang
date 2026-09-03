import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env.local', '.env'], override: false })

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error('DATABASE_URL is required')
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
