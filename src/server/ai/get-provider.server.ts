import { resolveAiSettings } from '#/modules/settings/settings.service'
import type { Db } from '#/server/db/client.server'

import type { AiVendor } from './catalog'
import { createMockAiProvider } from './mock-provider.server'
import type { AiOperation, ModelPolicy } from './model-policy'
import { resolveModelPolicy } from './model-policy'
import { OpenAiProvider } from './openai-provider.server'
import type { AiProvider } from './provider'

export type AiRuntime = {
  vendor: AiVendor | 'mock'
  provider: AiProvider
  policyFor: (operation: AiOperation) => ModelPolicy
}

function mockRuntime(): AiRuntime {
  return {
    vendor: 'mock',
    provider: createMockAiProvider(),
    policyFor: (operation) => resolveModelPolicy(operation),
  }
}

function forceMockAi(): boolean {
  return (process.env.AI_FORCE_MOCK || '').trim() === '1'
}

export async function loadAiRuntime(db: Db): Promise<AiRuntime> {
  if (forceMockAi()) {
    console.info('[ai] using mock provider (AI_FORCE_MOCK=1)')
    return mockRuntime()
  }

  const resolved = await resolveAiSettings(db)
  if (!resolved) {
    console.info('[ai] using mock provider (no in-app key or env fallback)')
    return mockRuntime()
  }

  console.info(
    `[ai] using ${resolved.vendor} (${resolved.source}) model=${resolved.model}`,
  )
  return {
    vendor: resolved.vendor,
    provider: new OpenAiProvider({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseURL,
      defaultModel: resolved.model,
    }),
    policyFor: (operation) =>
      resolveModelPolicy(operation, { model: resolved.model }),
  }
}

/** Env-only helper for scripts/probes that do not have a request db. */
export function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase().trim()
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (provider === 'openai' && apiKey) {
    return new OpenAiProvider({
      apiKey,
      defaultModel: process.env.AI_MODEL_PRIMARY || 'gpt-4o',
    })
  }
  return createMockAiProvider()
}
