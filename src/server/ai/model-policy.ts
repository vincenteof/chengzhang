export type AiOperation =
  | 'claim'
  | 'analysis'
  | 'questions'
  | 'outline'
  | 'draft'
  | 'organize'
  | 'expand'
  | 'polish'
  | 'feedback'

export type ModelPolicy = {
  model: string
  reasoning: 'low' | 'medium' | 'high' | null
  timeoutMs: number
}

const DEFAULT_TIMEOUT = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 90_000)

export function resolveModelPolicy(operation: AiOperation): ModelPolicy {
  const primary = process.env.AI_MODEL_PRIMARY || 'gpt-4o'
  const fast = process.env.AI_MODEL_FAST || primary

  switch (operation) {
    case 'claim':
    case 'analysis':
    case 'questions':
    case 'outline':
    case 'draft':
      return { model: primary, reasoning: 'medium', timeoutMs: DEFAULT_TIMEOUT }
    case 'organize':
    case 'expand':
    case 'polish':
    case 'feedback':
      return { model: fast, reasoning: 'low', timeoutMs: DEFAULT_TIMEOUT }
    default:
      return { model: primary, reasoning: null, timeoutMs: DEFAULT_TIMEOUT }
  }
}
