import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as draftsService from '#/modules/drafts/drafts.service'
import { requireSessionUser } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import type { AppResult } from '#/shared/result'
import { ok } from '#/shared/result'
import { toAppError } from '#/shared/service-error'

const outlineSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string(),
  approach: z.string(),
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      purpose: z.string(),
      fragmentIds: z.array(z.string()),
      missingMaterial: z.array(z.string()),
    }),
  ),
})

export const getDraftFn = createServerFn({ method: 'GET' })
  .validator(z.object({ draftId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AppResult<draftsService.DraftRecord>> => {
    try {
      await requireSessionUser()
      return ok(await draftsService.getDraft(getDb(), data.draftId))
    } catch (error) {
      return toAppError(error, '无法加载草稿')
    }
  })

export const createDraftFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      title: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<draftsService.DraftRecord>> => {
    try {
      await requireSessionUser()
      return ok(await draftsService.createDraftForIdea(getDb(), data))
    } catch (error) {
      return toAppError(error, '创建草稿失败')
    }
  })

export const saveDraftFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      baseRevision: z.number().int().positive(),
      title: z.string().optional(),
      description: z.string().nullable().optional(),
      slug: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      content: z.string().optional(),
      outline: outlineSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<draftsService.DraftRecord>> => {
    try {
      await requireSessionUser()
      return ok(await draftsService.saveDraft(getDb(), data))
    } catch (error) {
      return toAppError(error, '保存草稿失败')
    }
  })

export const completeDraftFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      baseRevision: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await draftsService.completeDraft(getDb(), data))
    } catch (error) {
      return toAppError(error, '标记完成失败')
    }
  })

export const reopenDraftFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      baseRevision: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await draftsService.reopenDraft(getDb(), data))
    } catch (error) {
      return toAppError(error, '恢复编辑失败')
    }
  })

export const getDraftEditorContextFn = createServerFn({ method: 'GET' })
  .validator(z.object({ draftId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AppResult<draftsService.DraftEditorContext>> => {
    try {
      await requireSessionUser()
      return ok(await draftsService.getDraftEditorContext(getDb(), data.draftId))
    } catch (error) {
      return toAppError(error, '无法加载草稿工作区')
    }
  })

export const clearDraftStaleFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      draftId: z.string().min(1),
      baseRevision: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<draftsService.DraftRecord>> => {
    try {
      await requireSessionUser()
      return ok(
        await draftsService.clearDraftStale(getDb(), {
          draftId: data.draftId,
          baseRevision: data.baseRevision,
        }),
      )
    } catch (error) {
      return toAppError(error, '无法清除过期标记')
    }
  })
