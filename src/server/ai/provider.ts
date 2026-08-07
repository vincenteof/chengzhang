import type { z } from 'zod'

export type AiTextEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type StructuredRequest<T> = {
  operation: string
  system: string
  prompt: string
  schema: z.ZodType<T>
  signal?: AbortSignal
  timeoutMs?: number
}

export type TextRequest = {
  operation: string
  system: string
  prompt: string
  signal?: AbortSignal
  timeoutMs?: number
}

export type AiResult<T> =
  | { ok: true; data: T; model: string; inputTokens?: number; outputTokens?: number }
  | {
      ok: false
      code: 'AI_UNAVAILABLE' | 'AI_REFUSAL' | 'AI_OUTPUT_INVALID' | 'AI_TIMEOUT' | 'CANCELLED'
      message: string
      model?: string
    }

export interface AiProvider {
  generateObject: <T>(request: StructuredRequest<T>) => Promise<AiResult<T>>
  generateText: (request: TextRequest) => Promise<AiResult<string>>
  streamText: (request: TextRequest) => AsyncIterable<AiTextEvent>
}
