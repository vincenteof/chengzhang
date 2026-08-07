import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as generationsService from '#/modules/generations/generations.service'
import { requireSessionUser } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import type { AppResult } from '#/shared/result'
import { ok } from '#/shared/result'
import { toAppError } from '#/shared/service-error'

export const generateClaimsFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.generateClaims(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '生成候选主张失败')
    }
  })

export const acceptClaimFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      generationId: z.string().min(1),
      claimText: z.string(),
      baseRevision: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.acceptClaim(getDb(), data))
    } catch (error) {
      return toAppError(error, '确认主张失败')
    }
  })

export const analyzeIdeaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.analyzeIdea(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '分析素材失败')
    }
  })

export const generateQuestionsFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.generateQuestions(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '生成追问失败')
    }
  })

export const listOpenQuestionsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.listOpenQuestions(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '加载追问失败')
    }
  })

export const answerQuestionFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      questionId: z.string().min(1),
      answer: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.answerQuestion(getDb(), data))
    } catch (error) {
      return toAppError(error, '回答追问失败')
    }
  })

export const dismissQuestionFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      questionId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.dismissQuestion(getDb(), data))
    } catch (error) {
      return toAppError(error, '忽略追问失败')
    }
  })

export const generateOutlinesFn = createServerFn({ method: 'POST' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.generateOutlines(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '生成结构失败')
    }
  })

export const acceptOutlineFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      generationId: z.string().min(1),
      optionId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.acceptOutline(getDb(), data))
    } catch (error) {
      return toAppError(error, '选择结构失败')
    }
  })

export const generateDraftFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      draftId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.generateDraft(getDb(), data))
    } catch (error) {
      return toAppError(error, '生成初稿失败')
    }
  })

export const acceptDraftGenerationFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      generationId: z.string().min(1),
      draftId: z.string().min(1),
      baseRevision: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(await generationsService.acceptDraftGeneration(getDb(), data))
    } catch (error) {
      return toAppError(error, '接受初稿失败')
    }
  })

export const rejectGenerationFn = createServerFn({ method: 'POST' })
  .validator(z.object({ generationId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AppResult<{ id: string }>> => {
    try {
      await requireSessionUser()
      return ok(await generationsService.rejectGeneration(getDb(), data.generationId))
    } catch (error) {
      return toAppError(error, '拒绝建议失败')
    }
  })

export const listRecentGenerationsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      ideaId: z.string().min(1),
      operations: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireSessionUser()
      return ok(
        await generationsService.listRecentGenerations(getDb(), {
          ideaId: data.ideaId,
          operations: data.operations,
        }),
      )
    } catch (error) {
      return toAppError(error, '加载生成记录失败')
    }
  })
