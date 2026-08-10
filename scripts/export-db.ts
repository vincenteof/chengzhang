import { config } from 'dotenv'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

config({ path: ['.env.local', '.env'] })

/**
 * Logical export helper for operator backup drills.
 * Prefer managed Postgres PITR in production; this is a portable dump.
 */
function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is required')
  }

  const outDir = path.resolve('backups')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outFile = path.join(outDir, `chengzhang-${stamp}.sql`)

  execFileSync('pg_dump', [url, '--no-owner', '--format=p', `-f`, outFile], {
    stdio: 'inherit',
  })
  console.log(`Exported to ${outFile}`)
  console.log('Restore example: psql "$DATABASE_URL" < backups/....sql')
}

main()
