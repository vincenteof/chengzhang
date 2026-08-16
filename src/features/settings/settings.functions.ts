import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as settingsService from '#/modules/settings/settings.service'
import { AI_VENDORS, isAiVendor } from '#/server/ai/catalog'
import { loadAiRuntime } from '#/server/ai/get-provider.server'
import { requireSessionUser } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import type { AppResult } from '#/shared/result'
import { ok } from '#/shared/result'
import { toAppError } from '#/shared/service-error'

const vendorSchema = z.enum(AI_VENDORS)

export const getAiSettingsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppResult<settingsService.AiSettingsPublic>> => {
    try {
      await requireSessionUser()
      return ok(await settingsService.getAiSettingsPublic(getDb()))
    } catch (error) {
      return toAppError(error, '无法读取模型设置')
    }
  },
)

export const saveAiSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      vendor: vendorSchema,
      apiKey: z.string().nullable().optional(),
      clearKey: z.boolean().optional(),
      model: z.string().min(1),
    }),
  )
  .handler(
    async ({ data }): Promise<AppResult<settingsService.AiSettingsPublic>> => {
      try {
        await requireSessionUser()
        if (!isAiVendor(data.vendor)) {
          throw Object.assign(new Error('不支持的模型厂商'), {
            code: 'VALIDATION_ERROR',
          })
        }
        return ok(await settingsService.saveAiSettings(getDb(), data))
      } catch (error) {
        return toAppError(error, '保存模型设置失败')
      }
    },
  )

export const testAiSettingsFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<AppResult<{ model: string; vendor: string }>> => {
    try {
      await requireSessionUser()
      const runtime = await loadAiRuntime(getDb())
      if (runtime.vendor === 'mock') {
        throw Object.assign(new Error('尚未配置可用的 API Key'), {
          code: 'VALIDATION_ERROR',
        })
      }
      const policy = runtime.policyFor('polish')
      const result = await runtime.provider.generateText({
        operation: 'polish',
        system: 'Reply with the single word ok.',
        prompt: 'ping',
        model: policy.model,
        timeoutMs: 20_000,
      })
      if (!result.ok) {
        throw Object.assign(new Error(result.message), { code: result.code })
      }
      return ok({ model: result.model, vendor: runtime.vendor })
    } catch (error) {
      return toAppError(error, '探测模型失败')
    }
  },
)
