import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as ideaChat from '#/modules/ideas/idea-chat.service'
import { requireSessionUser } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import type { AppResult } from '#/shared/result'
import { ok } from '#/shared/result'
import { toAppError } from '#/shared/service-error'

export const listIdeaMessagesFn = createServerFn({ method: 'GET' })
  .validator(z.object({ ideaId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AppResult<ideaChat.IdeaChatMessage[]>> => {
    try {
      await requireSessionUser()
      return ok(await ideaChat.listIdeaMessages(getDb(), data.ideaId))
    } catch (error) {
      return toAppError(error, '无法加载对话')
    }
  })
