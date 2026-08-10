export const APP_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'REVISION_CONFLICT',
  'DELETE_RESTRICTED',
  'GENERATION_IN_PROGRESS',
  'AI_UNAVAILABLE',
  'AI_REFUSAL',
  'AI_OUTPUT_INVALID',
  'AI_TIMEOUT',
  'STALE_AI_SUGGESTION',
  'CANCELLED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export function isRetryable(code: AppErrorCode): boolean {
  return (
    code === 'AI_UNAVAILABLE' ||
    code === 'AI_TIMEOUT' ||
    code === 'RATE_LIMITED' ||
    code === 'INTERNAL_ERROR'
  )
}
