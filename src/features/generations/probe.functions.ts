import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getAiProvider } from '#/server/ai/get-provider.server'
import { requireSessionUser } from '#/server/auth/session.server'
import { createId } from '#/shared/ids'
import type { AppResult } from '#/shared/result'
import { err, ok } from '#/shared/result'

const claimSchema = z.object({
  canFormClaim: z.boolean(),
  insufficiencyReason: z.string().nullable(),
  candidates: z
    .array(
      z.object({
        id: z.string(),
        claim: z.string(),
        rationale: z.string(),
        evidence: z.array(
          z.object({
            fragmentId: z.string(),
            reason: z.string(),
          }),
        ),
        tensions: z.array(z.string()),
        uncertainties: z.array(z.string()),
      }),
    )
    .max(3),
})

export const probeStructuredClaimFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<AppResult<z.infer<typeof claimSchema>>> => {
    const requestId = createId('req')
    try {
      await requireSessionUser()
      const provider = getAiProvider()
      const result = await provider.generateObject({
        operation: 'claim',
        system: 'You are a mock structured generator for Slice 0 probes.',
        prompt: 'Generate candidate claims from fragments.',
        schema: claimSchema,
      })

      if (!result.ok) {
        return err({
          code: result.code,
          message: result.message,
          retryable: result.code === 'AI_UNAVAILABLE' || result.code === 'AI_TIMEOUT',
          requestId,
        })
      }

      return ok(result.data)
    } catch (e) {
      if (e instanceof Response && e.status === 401) {
        return err({
          code: 'UNAUTHORIZED',
          message: '请先登录',
          retryable: false,
          requestId,
        })
      }
      return err({
        code: 'INTERNAL_ERROR',
        message: '结构化探针失败',
        retryable: true,
        requestId,
      })
    }
  },
)

export const probeStreamTextFn = createServerFn({ method: 'POST' })
  .validator(z.object({ cancelAfterMs: z.number().int().min(0).optional() }))
  .handler(async ({ data }): Promise<AppResult<{ text: string; cancelled: boolean }>> => {
    const requestId = createId('req')
    try {
      await requireSessionUser()
      const provider = getAiProvider()
      const controller = new AbortController()

      if (data.cancelAfterMs && data.cancelAfterMs > 0) {
        setTimeout(() => controller.abort(), data.cancelAfterMs)
      }

      let text = ''
      let cancelled = false
      for await (const event of provider.streamText({
        operation: 'draft',
        system: 'mock stream',
        prompt: 'stream probe',
        signal: controller.signal,
      })) {
        if (event.type === 'text-delta') {
          text += event.textDelta
        } else if (event.type === 'error') {
          cancelled = true
          break
        }
      }

      return ok({ text, cancelled })
    } catch (e) {
      if (e instanceof Response && e.status === 401) {
        return err({
          code: 'UNAUTHORIZED',
          message: '请先登录',
          retryable: false,
          requestId,
        })
      }
      return err({
        code: 'INTERNAL_ERROR',
        message: '流式探针失败',
        retryable: true,
        requestId,
      })
    }
  })
