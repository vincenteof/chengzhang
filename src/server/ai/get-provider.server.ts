import { createMockAiProvider } from './mock-provider.server'
import type { AiProvider } from './provider'

export function getAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER ?? 'mock'
  if (provider === 'mock') {
    return createMockAiProvider()
  }

  // Real OpenAI adapter is introduced in Slice 2; Slice 0 defaults to mock.
  // Setting AI_PROVIDER=openai without implementation falls back to mock with a warning.
  console.warn(
    `[ai] provider "${provider}" is not fully wired in Slice 0; using mock. Set AI_PROVIDER=mock to silence.`,
  )
  return createMockAiProvider()
}
