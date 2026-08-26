import { asc, eq } from 'drizzle-orm'

import { serializeFragments } from '#/server/ai/context'
import { friendlyAiError } from '#/server/ai/friendly-error'
import { loadAiRuntime } from '#/server/ai/get-provider.server'
import {
  buildIdeaChatPrompt,
  serializeChatTranscript,
} from '#/server/ai/prompts/idea-chat'
import type { Db } from '#/server/db/client.server'
import {
  ideaFragments,
  ideaMessages,
  ideas,
  fragments,
} from '#/server/db/schema'
import { createId } from '#/shared/ids'

export type IdeaChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export function mapMessage(
  row: typeof ideaMessages.$inferSelect,
): IdeaChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listIdeaMessages(
  db: Db,
  ideaId: string,
): Promise<IdeaChatMessage[]> {
  const rows = await db
    .select()
    .from(ideaMessages)
    .where(eq(ideaMessages.ideaId, ideaId))
    .orderBy(asc(ideaMessages.createdAt), asc(ideaMessages.id))
  return rows.map(mapMessage)
}

export async function insertIdeaMessage(
  db: Db,
  input: {
    ideaId: string
    role: 'user' | 'assistant'
    content: string
  },
): Promise<IdeaChatMessage> {
  const now = new Date()
  const row = {
    id: createId('imsg'),
    ideaId: input.ideaId,
    role: input.role,
    content: input.content,
    createdAt: now,
  }
  await db.insert(ideaMessages).values(row)
  await db
    .update(ideas)
    .set({ updatedAt: now })
    .where(eq(ideas.id, input.ideaId))
  return mapMessage(row)
}

export async function loadIdeaChatContext(db: Db, ideaId: string) {
  const idea = await db
    .select()
    .from(ideas)
    .where(eq(ideas.id, ideaId))
    .limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
  }
  const fragRows = await db
    .select({
      id: fragments.id,
      content: fragments.content,
      createdAt: fragments.createdAt,
    })
    .from(ideaFragments)
    .innerJoin(fragments, eq(fragments.id, ideaFragments.fragmentId))
    .where(eq(ideaFragments.ideaId, ideaId))
    .orderBy(fragments.createdAt, fragments.id)

  const messages = await listIdeaMessages(db, ideaId)
  return { idea: idea[0], fragments: fragRows, messages }
}

export type IdeaChatStreamEvent =
  | { type: 'user'; message: IdeaChatMessage }
  | { type: 'delta'; text: string }
  | { type: 'done'; message: IdeaChatMessage }
  | { type: 'error'; message: string }

export async function* streamIdeaChat(
  db: Db,
  input: { ideaId: string; content: string },
  signal?: AbortSignal,
): AsyncGenerator<IdeaChatStreamEvent> {
  const text = input.content.trim()
  if (!text) {
    throw Object.assign(new Error('请先写一句'), { code: 'VALIDATION_ERROR' })
  }

  const ctx = await loadIdeaChatContext(db, input.ideaId)
  const user = await insertIdeaMessage(db, {
    ideaId: input.ideaId,
    role: 'user',
    content: text,
  })
  yield { type: 'user', message: user }

  const transcript = serializeChatTranscript(
    [...ctx.messages, user].map((m) => ({ role: m.role, content: m.content })),
  )
  const fragmentsXml = serializeFragments(
    ctx.fragments.map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  )
  const built = buildIdeaChatPrompt({
    ideaName: ctx.idea.name,
    ideaDescription: ctx.idea.description,
    fragmentsXml,
    transcript,
  })

  const runtime = await loadAiRuntime(db)
  const policy = runtime.policyFor('chat')

  let acc = ''
  try {
    for await (const event of runtime.provider.streamText({
      operation: 'chat',
      system: built.system,
      prompt: built.prompt,
      model: policy.model,
      timeoutMs: policy.timeoutMs,
      signal,
    })) {
      if (signal?.aborted) break
      if (event.type === 'text-delta') {
        acc += event.textDelta
        yield { type: 'delta', text: event.textDelta }
      }
      if (event.type === 'error') {
        yield { type: 'error', message: friendlyAiError(event.message) }
        return
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      yield { type: 'error', message: '已取消' }
      return
    }
    const message = error instanceof Error ? error.message : '对话失败'
    yield { type: 'error', message: friendlyAiError(message) }
    return
  }

  const reply = acc.trim()
  if (!reply) {
    yield { type: 'error', message: '没有生成回复' }
    return
  }

  const assistant = await insertIdeaMessage(db, {
    ideaId: input.ideaId,
    role: 'assistant',
    content: reply,
  })
  yield { type: 'done', message: assistant }
}
