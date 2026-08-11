import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as fragmentsService from '#/modules/fragments/fragments.service'
import { requireSessionUser } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import type { AppResult } from '#/shared/result'
import { ok } from '#/shared/result'
import { toAppError } from '#/shared/service-error'

export const listFragmentsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      unassignedOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<fragmentsService.FragmentRecord[]>> => {
    try {
      await requireSessionUser()
      const rows = await fragmentsService.listFragments(getDb(), {
        unassignedOnly: data.unassignedOnly,
      })
      return ok(rows)
    } catch (error) {
      return toAppError(error, '无法加载碎片')
    }
  })

export const createFragmentFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      content: z.string(),
      captureRequestId: z.string().min(1),
      ideaId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<fragmentsService.FragmentRecord>> => {
    try {
      await requireSessionUser()
      const row = await fragmentsService.createFragment(getDb(), data)
      return ok(row)
    } catch (error) {
      return toAppError(error, '保存碎片失败')
    }
  })

export const updateFragmentFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      content: z.string(),
      baseRevision: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<fragmentsService.FragmentRecord>> => {
    try {
      await requireSessionUser()
      const row = await fragmentsService.updateFragment(getDb(), data)
      return ok(row)
    } catch (error) {
      return toAppError(error, '更新碎片失败')
    }
  })

export const previewDeleteFragmentFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      const preview = await fragmentsService.previewDeleteFragment(getDb(), data.id)
      return ok(preview)
    } catch (error) {
      return toAppError(error, '无法预览删除影响')
    }
  })

export const deleteFragmentFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      const result = await fragmentsService.deleteFragment(getDb(), data.id)
      return ok(result)
    } catch (error) {
      return toAppError(error, '删除碎片失败')
    }
  })
