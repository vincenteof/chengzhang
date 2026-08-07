import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as ideasService from '#/modules/ideas/ideas.service'
import { requireSessionUser } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import type { AppResult } from '#/shared/result'
import { ok } from '#/shared/result'
import { toAppError } from '#/shared/service-error'

export const listIdeasFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppResult<ideasService.IdeaListItem[]>> => {
    try {
      await requireSessionUser()
      return ok(await ideasService.listIdeas(getDb()))
    } catch (error) {
      return toAppError(error, '无法加载 Idea 列表')
    }
  },
)

export const getIdeaWorkspaceFn = createServerFn({ method: 'GET' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AppResult<ideasService.IdeaWorkspace>> => {
    try {
      await requireSessionUser()
      return ok(await ideasService.getIdeaWorkspace(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '无法加载 Idea 工作区')
    }
  })

export const createIdeaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string(),
      description: z.string().nullable().optional(),
      fragmentIds: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<ideasService.IdeaListItem>> => {
    try {
      await requireSessionUser()
      return ok(await ideasService.createIdea(getDb(), data))
    } catch (error) {
      return toAppError(error, '创建 Idea 失败')
    }
  })

export const updateIdeaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      baseRevision: z.number().int().positive(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      confirmedClaim: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AppResult<ideasService.IdeaListItem>> => {
    try {
      await requireSessionUser()
      return ok(await ideasService.updateIdea(getDb(), data))
    } catch (error) {
      return toAppError(error, '更新 Idea 失败')
    }
  })

export const addIdeaFragmentsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      fragmentIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await ideasService.addIdeaFragments(getDb(), data))
    } catch (error) {
      return toAppError(error, '加入碎片失败')
    }
  })

export const removeIdeaFragmentFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      fragmentId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await ideasService.removeIdeaFragment(getDb(), data))
    } catch (error) {
      return toAppError(error, '移出碎片失败')
    }
  })

export const previewDeleteIdeaFn = createServerFn({ method: 'GET' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await ideasService.previewDeleteIdea(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '无法预览删除影响')
    }
  })

export const deleteIdeaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      deleteDraft: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await ideasService.deleteIdea(getDb(), data))
    } catch (error) {
      return toAppError(error, '删除 Idea 失败')
    }
  })
