/**
 * Resolve Cloudflare Workers bindings.
 * `cloudflare:workers` is provided by @cloudflare/vite-plugin / workerd.
 * Vitest aliases it to `cloudflare-workers.stub.ts`.
 */
import { env as workerEnv } from 'cloudflare:workers'

export type HyperdriveBinding = {
  connectionString: string
}

type R2ObjectBody = {
  arrayBuffer: () => Promise<ArrayBuffer>
  httpMetadata?: { contentType?: string }
}

type MediaR2Bucket = {
  put: (
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>
  get: (key: string) => Promise<R2ObjectBody | null>
}

export type ChengzhangWorkerEnv = {
  HYPERDRIVE?: HyperdriveBinding
  DATABASE_URL?: string
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  APP_ORIGIN?: string
  SESSION_SECRET?: string
  OPENAI_API_KEY?: string
  AI_PROVIDER?: string
  AI_FORCE_MOCK?: string
  AI_MODEL_PRIMARY?: string
  AI_MODEL_FAST?: string
  AI_REQUEST_TIMEOUT_MS?: string
  DB_POOL_MAX?: string
  AUTH_ALLOWED_EMAIL?: string
  AUTH_LOGIN_MAX_FAILURES?: string
  AUTH_LOGIN_WINDOW_MS?: string
  MEDIA?: MediaR2Bucket
}

export function asWorkerEnv(): ChengzhangWorkerEnv {
  return (workerEnv ?? {}) as ChengzhangWorkerEnv
}

/** Prefer Hyperdrive, then binding/env DATABASE_URL, then process.env. */
export function resolveDatabaseUrl(): string {
  const env = asWorkerEnv()
  const fromHyperdrive = env.HYPERDRIVE?.connectionString?.trim()
  if (fromHyperdrive) return fromHyperdrive

  const fromBinding = env.DATABASE_URL?.trim()
  if (fromBinding) return fromBinding

  const fromProcess = process.env.DATABASE_URL?.trim()
  if (fromProcess) return fromProcess

  throw new Error(
    'DATABASE_URL is required (set secret/var, or configure Hyperdrive binding HYPERDRIVE)',
  )
}

export function resolveDbPoolMax(): number {
  const env = asWorkerEnv()
  const raw =
    env.DB_POOL_MAX?.trim() ||
    process.env.DB_POOL_MAX?.trim() ||
    (env.HYPERDRIVE ? '1' : '10')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}
