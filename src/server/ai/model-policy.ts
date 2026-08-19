export type AiOperation =
  | 'claim'
  | 'analysis'
  | 'questions'
  | 'outline'
  | 'draft'
  | 'chat'
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

export type ModelChoice = {
  model: string
}

export function resolveModelPolicy(
  operation: AiOperation,
  choice?: ModelChoice | null,
): ModelPolicy {
  const model = choice?.model || process.env.AI_MODEL_PRIMARY || 'gpt-4o'

  switch (operation) {
    case 'claim':
    case 'analysis':
    case 'questions':
    case 'outline':
    case 'draft':
      return { model, reasoning: 'medium', timeoutMs: DEFAULT_TIMEOUT }
    case 'chat':
    case 'organize':
    case 'expand':
    case 'polish':
    case 'feedback':
      return { model, reasoning: 'low', timeoutMs: DEFAULT_TIMEOUT }
    default:
      return { model, reasoning: null, timeoutMs: DEFAULT_TIMEOUT }
  }
}
