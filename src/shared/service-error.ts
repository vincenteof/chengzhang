import type { AppErrorCode } from './errors'
import { isRetryable } from './errors'
import { createId } from './ids'
import type { AppResult, JsonValue } from './result'
import { err } from './result'

export function getErrorCode(error: unknown): AppErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') {
      return code as AppErrorCode
    }
  }
  return 'INTERNAL_ERROR'
}

export function toAppError(
  error: unknown,
  fallbackMessage: string,
  requestId = createId('req'),
): AppResult<never> {
  if (error instanceof Response) {
    if (error.status === 401) {
      return err({
        code: 'UNAUTHORIZED',
        message: '请先登录',
        retryable: false,
        requestId,
      })
    }
    return err({
      code: 'INTERNAL_ERROR',
      message: fallbackMessage,
      retryable: true,
      requestId,
    })
  }

  const code = getErrorCode(error)
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage
  const details =
    error &&
    typeof error === 'object' &&
    'details' in error &&
    (error as { details?: { [key: string]: JsonValue } }).details
      ? (error as { details: { [key: string]: JsonValue } }).details
      : undefined

  return err({
    code,
    message,
    retryable: isRetryable(code),
    requestId,
    details,
  })
}
