import path from 'node:path'

export function resolveDatabaseUrl(): string {
  const fromProcess = process.env.DATABASE_URL?.trim()
  if (fromProcess) return fromProcess
  throw new Error('DATABASE_URL is required')
}

export function resolveDbPoolMax(): number {
  const raw = process.env.DB_POOL_MAX?.trim() || '10'
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 10
}

export function resolveMediaDir(): string {
  const fromEnv = process.env.MEDIA_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(process.cwd(), '.tmp/media')
}
