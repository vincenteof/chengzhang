import { config } from 'dotenv'
import { Pool } from 'pg'

config({ path: ['.env.local', '.env'] })

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: url })
  try {
    const version = await pool.query('select version()')
    console.log('PostgreSQL:', version.rows[0].version)

    const tables = await pool.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `)
    console.log(
      'Tables:',
      tables.rows.map((r: { table_name: string }) => r.table_name).join(', ') ||
        '(none)',
    )

    const required = ['fragments', 'ideas', 'drafts', 'ai_generations', 'user', 'session']
    const names = new Set(
      tables.rows.map((r: { table_name: string }) => r.table_name),
    )
    const missing = required.filter((t) => !names.has(t))
    if (missing.length) {
      console.error('Missing tables:', missing.join(', '))
      process.exitCode = 1
      return
    }
    console.log('db:verify OK')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
