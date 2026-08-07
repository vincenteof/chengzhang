import { createMockAiProvider } from './mock-provider.server'
import { OpenAiProvider } from './openai-provider.server'
import type { AiProvider } from './provider'

export function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase().trim()

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        '[ai] AI_PROVIDER=openai but OPENAI_API_KEY missing; falling back to mock',
      )
      return createMockAiProvider()
    }
    console.info(
      `[ai] using OpenAI provider model=${process.env.AI_MODEL_PRIMARY || 'gpt-4o'}`,
    )
    return new OpenAiProvider()
  }

  console.info(`[ai] using mock provider (AI_PROVIDER=${provider || 'mock'})`)
  return createMockAiProvider()
}
