import type { AppErrorCode } from './errors'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type AppError = {
  code: AppErrorCode
  message: string
  retryable: boolean
  requestId: string
  details?: { [key: string]: JsonValue }
}

export type AppResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError }

export function ok<T>(data: T): AppResult<T> {
  return { ok: true, data }
}

export function err<T = never>(error: AppError): AppResult<T> {
  return { ok: false, error }
}
