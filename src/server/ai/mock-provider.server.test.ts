import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { MockAiProvider } from './mock-provider.server'

describe('MockAiProvider', () => {
  it('returns structured claim-shaped data', async () => {
    const provider = new MockAiProvider()
    const schema = z.object({
      canFormClaim: z.boolean(),
      insufficiencyReason: z.string().nullable(),
      candidates: z.array(z.any()).max(3),
    })

    const result = await provider.generateObject({
      operation: 'claim',
      system: 's',
      prompt: 'p',
      schema,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.canFormClaim).toBe(true)
      expect(result.data.candidates.length).toBeGreaterThan(0)
    }
  })

  it('honors abort during streaming', async () => {
    const provider = new MockAiProvider()
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)

    let cancelled = false
    let text = ''
    for await (const event of provider.streamText({
      operation: 'draft',
      system: 's',
      prompt: 'p',
      signal: controller.signal,
    })) {
      if (event.type === 'text-delta') text += event.textDelta
      if (event.type === 'error') cancelled = true
    }

    expect(cancelled).toBe(true)
    expect(text.length).toBeLessThan(80)
  })
})
