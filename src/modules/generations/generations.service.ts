import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { outlineToMarkdownSkeleton } from '#/modules/drafts/outline-skeleton'
import { markIdeaDraftsStale } from '#/modules/drafts/drafts.service'
import { serializeFragments } from '#/server/ai/context'
import { getAiProvider } from '#/server/ai/get-provider.server'
import type { AiOperation } from '#/server/ai/model-policy'
import { resolveModelPolicy } from '#/server/ai/model-policy'
import { buildAnalysisPrompt } from '#/server/ai/prompts/analysis.v1'
import { buildClaimPrompt } from '#/server/ai/prompts/claim.v1'
import { buildDraftPrompt } from '#/server/ai/prompts/draft.v1'
import { buildOutlinePrompt } from '#/server/ai/prompts/outline.v1'
import { buildQuestionsPrompt } from '#/server/ai/prompts/questions.v1'
import { PROMPT_VERSIONS } from '#/server/ai/prompts/base-authorship.v1'
import { ideaAnalysisSchema } from '#/server/ai/schemas/analysis'
import { candidateClaimsSchema } from '#/server/ai/schemas/claim'
import { outlinesSchema } from '#/server/ai/schemas/outline'
import { ideaQuestionsSchema } from '#/server/ai/schemas/questions'
import {
  selectionFeedbackSchema,
  selectionRewriteSchema,
} from '#/server/ai/schemas/selection'
import type { SelectionOp } from '#/server/ai/prompts/selection.v1'
import { buildSelectionPrompt } from '#/server/ai/prompts/selection.v1'
import type { Db } from '#/server/db/client.server'
import { hashText } from '#/shared/text-hash'
import type { Outline } from '#/server/db/schema'
import {
  aiGenerations,
  drafts,
  emptyOutline,
  fragments,
  ideaFragments,
  ideaQuestions,
  ideas,
} from '#/server/db/schema'
import { createId } from '#/shared/ids'
import type { JsonValue } from '#/shared/result'

export type GenerationRecord = {
  id: string
  operation: string
  ideaId: string | null
  draftId: string | null
  executionStatus: string
  resolution: string
  outputJson: JsonValue | null
  outputText: string | null
  errorCode: string | null
  errorMessage: string | null
  promptVersion: string
  model: string
  startedAt: string
  completedAt: string | null
}

function toIso(d: Date | null | undefined) {
  return d ? d.toISOString() : null
}

function mapGeneration(row: typeof aiGenerations.$inferSelect): GenerationRecord {
  return {
    id: row.id,
    operation: row.operation,
    ideaId: row.ideaId,
    draftId: row.draftId,
    executionStatus: row.executionStatus,
    resolution: row.resolution,
    outputJson: (row.outputJson as JsonValue | null) ?? null,
    outputText: row.outputText,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    promptVersion: row.promptVersion,
    model: row.model,
    startedAt: row.startedAt.toISOString(),
    completedAt: toIso(row.completedAt),
  }
}

async function loadIdeaFragments(db: Db, ideaId: string) {
  const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
  }
  const rows = await db
    .select({
      id: fragments.id,
      content: fragments.content,
      createdAt: fragments.createdAt,
    })
    .from(ideaFragments)
    .innerJoin(fragments, eq(fragments.id, ideaFragments.fragmentId))
    .where(eq(ideaFragments.ideaId, ideaId))
    .orderBy(fragments.createdAt, fragments.id)

  return { idea: idea[0], fragments: rows }
}

async function assertNoPending(
  db: Db,
  input: { ideaId?: string; draftId?: string; operation: string },
) {
  const conditions = [
    eq(aiGenerations.operation, input.operation),
    eq(aiGenerations.executionStatus, 'pending'),
  ]
  if (input.ideaId) conditions.push(eq(aiGenerations.ideaId, input.ideaId))
  if (input.draftId) conditions.push(eq(aiGenerations.draftId, input.draftId))

  const existing = await db
    .select({ id: aiGenerations.id })
    .from(aiGenerations)
    .where(and(...conditions))
    .limit(1)

  if (existing[0]) {
    throw Object.assign(new Error('已有进行中的生成任务'), {
      code: 'GENERATION_IN_PROGRESS',
      details: { generationId: existing[0].id },
    })
  }
}

async function insertPending(
  db: Db,
  input: {
    operation: AiOperation
    ideaId?: string
    draftId?: string
    fragmentIds: string[]
    snapshot: Record<string, unknown>
    promptVersion: string
    model: string
    reasoning: string | null
  },
) {
  const id = createId('gen')
  const now = new Date()
  await db.insert(aiGenerations).values({
    id,
    operation: input.operation,
    ideaId: input.ideaId ?? null,
    draftId: input.draftId ?? null,
    provider: process.env.AI_PROVIDER || 'mock',
    model: input.model,
    reasoning: input.reasoning,
    promptVersion: input.promptVersion,
    inputSnapshotJson: input.snapshot,
    fragmentIdsJson: input.fragmentIds,
    executionStatus: 'pending',
    resolution: 'pending',
    startedAt: now,
  })
  return id
}

async function finishGeneration(
  db: Db,
  input: {
    id: string
    status: 'succeeded' | 'failed' | 'cancelled'
    outputJson?: unknown
    outputText?: string
    errorCode?: string
    errorMessage?: string
    inputTokens?: number
    outputTokens?: number
    model?: string
  },
) {
  const patch: Record<string, unknown> = {
    executionStatus: input.status,
    outputJson: input.outputJson ?? null,
    outputText: input.outputText ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    completedAt: new Date(),
  }
  if (input.model) patch.model = input.model

  await db.update(aiGenerations).set(patch).where(eq(aiGenerations.id, input.id))
}

export async function listRecentGenerations(
  db: Db,
  input: { ideaId: string; operations?: string[]; limit?: number },
) {
  const rows = await db
    .select()
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.ideaId, input.ideaId),
        input.operations
          ? inArray(aiGenerations.operation, input.operations)
          : sql`true`,
      ),
    )
    .orderBy(desc(aiGenerations.startedAt))
    .limit(input.limit ?? 20)

  return rows.map(mapGeneration)
}

export async function generateClaims(db: Db, ideaId: string) {
  await assertNoPending(db, { ideaId, operation: 'claim' })
  const { idea, fragments: frags } = await loadIdeaFragments(db, ideaId)
  if (frags.length < 2) {
    throw Object.assign(new Error('至少需要 2 条碎片才能生成候选主张'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const policy = resolveModelPolicy('claim')
  const fragmentsXml = serializeFragments(
    frags.map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  )
  const built = buildClaimPrompt({
    ideaName: idea.name,
    ideaDescription: idea.description,
    fragmentsXml,
  })
  const genId = await insertPending(db, {
    operation: 'claim',
    ideaId,
    fragmentIds: frags.map((f) => f.id),
    snapshot: { ideaRevision: idea.revision, ideaName: idea.name },
    promptVersion: `${PROMPT_VERSIONS.base}+${built.promptVersion}`,
    model: policy.model,
    reasoning: policy.reasoning,
  })

  const provider = getAiProvider()
  console.info('[ai] generateClaims start', {
    ideaId,
    fragmentCount: frags.length,
    model: policy.model,
    generationId: genId,
  })
  const result = await provider.generateObject({
    operation: 'claim',
    system: built.system,
    prompt: built.prompt,
    schema: candidateClaimsSchema,
    timeoutMs: policy.timeoutMs,
  })

  if (!result.ok) {
    console.error('[ai] generateClaims failed', {
      generationId: genId,
      code: result.code,
      message: result.message,
      model: result.model || policy.model,
    })
    await finishGeneration(db, {
      id: genId,
      status: result.code === 'CANCELLED' ? 'cancelled' : 'failed',
      errorCode: result.code,
      errorMessage: result.message,
      model: result.model || policy.model,
    })
    throw Object.assign(new Error(result.message), { code: result.code })
  }

  console.info('[ai] generateClaims ok', {
    generationId: genId,
    candidateCount: result.data.candidates.length,
    canFormClaim: result.data.canFormClaim,
  })

  // Drop evidence refs that are not in input
  const allowed = new Set(frags.map((f) => f.id))
  const cleaned = {
    ...result.data,
    candidates: result.data.candidates.map((c) => ({
      ...c,
      evidence: c.evidence.filter((e) => allowed.has(e.fragmentId)),
    })),
  }

  await finishGeneration(db, {
    id: genId,
    status: 'succeeded',
    outputJson: cleaned,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  })

  return { generation: await getGeneration(db, genId), claims: cleaned }
}

export async function analyzeIdea(db: Db, ideaId: string) {
  await assertNoPending(db, { ideaId, operation: 'analysis' })
  const { idea, fragments: frags } = await loadIdeaFragments(db, ideaId)
  if (!idea.confirmedClaim?.trim()) {
    throw Object.assign(new Error('请先确认主张再分析素材'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const policy = resolveModelPolicy('analysis')
  const fragmentsXml = serializeFragments(
    frags.map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  )
  const built = buildAnalysisPrompt({
    ideaName: idea.name,
    confirmedClaim: idea.confirmedClaim,
    fragmentsXml,
  })
  const genId = await insertPending(db, {
    operation: 'analysis',
    ideaId,
    fragmentIds: frags.map((f) => f.id),
    snapshot: { ideaRevision: idea.revision, claim: idea.confirmedClaim },
    promptVersion: `${PROMPT_VERSIONS.base}+${built.promptVersion}`,
    model: policy.model,
    reasoning: policy.reasoning,
  })

  const provider = getAiProvider()
  console.info('[ai] analyzeIdea start', {
    ideaId,
    fragmentCount: frags.length,
    model: policy.model,
    generationId: genId,
  })
  const result = await provider.generateObject({
    operation: 'analysis',
    system: built.system,
    prompt: built.prompt,
    schema: ideaAnalysisSchema,
    timeoutMs: policy.timeoutMs,
  })

  if (!result.ok) {
    console.error('[ai] analyzeIdea failed', {
      generationId: genId,
      code: result.code,
      message: result.message,
      model: result.model || policy.model,
    })
    await finishGeneration(db, {
      id: genId,
      status: result.code === 'CANCELLED' ? 'cancelled' : 'failed',
      errorCode: result.code,
      errorMessage: result.message,
      model: result.model || policy.model,
    })
    throw Object.assign(new Error(result.message), { code: result.code })
  }

  console.info('[ai] analyzeIdea ok', { generationId: genId })
  await finishGeneration(db, {
    id: genId,
    status: 'succeeded',
    outputJson: result.data,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  })

  return { generation: await getGeneration(db, genId), analysis: result.data }
}

export async function generateQuestions(db: Db, ideaId: string) {
  await assertNoPending(db, { ideaId, operation: 'questions' })
  const { idea, fragments: frags } = await loadIdeaFragments(db, ideaId)
  if (!idea.confirmedClaim?.trim()) {
    throw Object.assign(new Error('请先确认主张再生成追问'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const policy = resolveModelPolicy('questions')
  const fragmentsXml = serializeFragments(
    frags.map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  )
  const built = buildQuestionsPrompt({
    ideaName: idea.name,
    confirmedClaim: idea.confirmedClaim,
    fragmentsXml,
  })
  const genId = await insertPending(db, {
    operation: 'questions',
    ideaId,
    fragmentIds: frags.map((f) => f.id),
    snapshot: { ideaRevision: idea.revision, claim: idea.confirmedClaim },
    promptVersion: `${PROMPT_VERSIONS.base}+${built.promptVersion}`,
    model: policy.model,
    reasoning: policy.reasoning,
  })

  const provider = getAiProvider()
  const result = await provider.generateObject({
    operation: 'questions',
    system: built.system,
    prompt: built.prompt,
    schema: ideaQuestionsSchema,
    timeoutMs: policy.timeoutMs,
  })

  if (!result.ok) {
    await finishGeneration(db, {
      id: genId,
      status: result.code === 'CANCELLED' ? 'cancelled' : 'failed',
      errorCode: result.code,
      errorMessage: result.message,
      model: result.model || policy.model,
    })
    throw Object.assign(new Error(result.message), { code: result.code })
  }

  const now = new Date()
  const questions = result.data.questions.slice(0, 3)

  await db.transaction(async (tx) => {
    await tx
      .update(aiGenerations)
      .set({
        executionStatus: 'succeeded',
        outputJson: result.data,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        model: result.model || policy.model,
        completedAt: now,
      })
      .where(eq(aiGenerations.id, genId))

    for (const q of questions) {
      await tx.insert(ideaQuestions).values({
        id: createId('q'),
        ideaId,
        generationId: genId,
        question: q.question,
        targetGap: q.targetGap,
        whyItMatters: q.whyItMatters,
        createdAt: now,
      })
    }
  })

  return {
    generation: await getGeneration(db, genId),
    questions: await listOpenQuestions(db, ideaId),
  }
}

export async function listOpenQuestions(db: Db, ideaId: string) {
  const rows = await db
    .select()
    .from(ideaQuestions)
    .where(and(eq(ideaQuestions.ideaId, ideaId), isNull(ideaQuestions.dismissedAt)))
    .orderBy(desc(ideaQuestions.createdAt))

  return rows.map((q) => ({
    id: q.id,
    question: q.question,
    targetGap: q.targetGap,
    whyItMatters: q.whyItMatters,
    answeredFragmentId: q.answeredFragmentId,
    createdAt: q.createdAt.toISOString(),
  }))
}

export async function answerQuestion(
  db: Db,
  input: { ideaId: string; questionId: string; answer: string },
) {
  const answer = input.answer.trim()
  if (!answer) {
    throw Object.assign(new Error('回答不能为空'), { code: 'VALIDATION_ERROR' })
  }

  const q = await db
    .select()
    .from(ideaQuestions)
    .where(
      and(
        eq(ideaQuestions.id, input.questionId),
        eq(ideaQuestions.ideaId, input.ideaId),
      ),
    )
    .limit(1)
  if (!q[0]) {
    throw Object.assign(new Error('追问不存在'), { code: 'NOT_FOUND' })
  }

  const now = new Date()
  const fragmentId = createId('frag')

  await db.transaction(async (tx) => {
    await tx.insert(fragments).values({
      id: fragmentId,
      content: answer,
      // 独立 capture id，避免唯一索引在部分环境下对 null 的歧义
      captureRequestId: createId('ans'),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(ideaFragments).values({
      ideaId: input.ideaId,
      fragmentId,
      createdAt: now,
    })
    await tx
      .update(ideaQuestions)
      .set({ answeredFragmentId: fragmentId })
      .where(eq(ideaQuestions.id, input.questionId))
    await tx
      .update(ideas)
      .set({
        revision: sql`${ideas.revision} + 1`,
        updatedAt: now,
      })
      .where(eq(ideas.id, input.ideaId))
  })

  await markIdeaDraftsStale(db, input.ideaId, 'material_changed')
  return { fragmentId, questionId: input.questionId }
}

export async function dismissQuestion(
  db: Db,
  input: { ideaId: string; questionId: string },
) {
  const updated = await db
    .update(ideaQuestions)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(ideaQuestions.id, input.questionId),
        eq(ideaQuestions.ideaId, input.ideaId),
      ),
    )
    .returning()
  if (!updated[0]) {
    throw Object.assign(new Error('追问不存在'), { code: 'NOT_FOUND' })
  }
  return { id: input.questionId }
}

export async function generateOutlines(db: Db, ideaId: string) {
  await assertNoPending(db, { ideaId, operation: 'outline' })
  const { idea, fragments: frags } = await loadIdeaFragments(db, ideaId)
  if (!idea.confirmedClaim?.trim()) {
    throw Object.assign(new Error('请先确认主张再生成结构'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const policy = resolveModelPolicy('outline')
  const fragmentsXml = serializeFragments(
    frags.map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  )
  const built = buildOutlinePrompt({
    ideaName: idea.name,
    confirmedClaim: idea.confirmedClaim,
    fragmentsXml,
  })
  const genId = await insertPending(db, {
    operation: 'outline',
    ideaId,
    fragmentIds: frags.map((f) => f.id),
    snapshot: { ideaRevision: idea.revision, claim: idea.confirmedClaim },
    promptVersion: `${PROMPT_VERSIONS.base}+${built.promptVersion}`,
    model: policy.model,
    reasoning: policy.reasoning,
  })

  const provider = getAiProvider()
  const result = await provider.generateObject({
    operation: 'outline',
    system: built.system,
    prompt: built.prompt,
    schema: outlinesSchema,
    timeoutMs: policy.timeoutMs,
  })

  if (!result.ok) {
    await finishGeneration(db, {
      id: genId,
      status: result.code === 'CANCELLED' ? 'cancelled' : 'failed',
      errorCode: result.code,
      errorMessage: result.message,
      model: result.model || policy.model,
    })
    throw Object.assign(new Error(result.message), { code: result.code })
  }

  await finishGeneration(db, {
    id: genId,
    status: 'succeeded',
    outputJson: result.data,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  })

  return { generation: await getGeneration(db, genId), outlines: result.data }
}

export async function acceptOutline(
  db: Db,
  input: {
    ideaId: string
    generationId: string
    optionId: string
  },
) {
  const gen = await getGenerationRow(db, input.generationId)
  if (gen.ideaId !== input.ideaId || gen.operation !== 'outline') {
    throw Object.assign(new Error('生成结果不匹配'), { code: 'VALIDATION_ERROR' })
  }
  if (gen.executionStatus !== 'succeeded') {
    throw Object.assign(new Error('生成尚未成功'), { code: 'VALIDATION_ERROR' })
  }

  const parsed = outlinesSchema.safeParse(gen.outputJson)
  if (!parsed.success) {
    throw Object.assign(new Error('结构输出无效'), { code: 'AI_OUTPUT_INVALID' })
  }
  const option = parsed.data.options.find((o) => o.id === input.optionId)
  if (!option) {
    throw Object.assign(new Error('结构方案不存在'), { code: 'NOT_FOUND' })
  }

  const outline: Outline = {
    schemaVersion: 1,
    title: option.title,
    approach: option.approach,
    sections: option.sections.map((s) => ({
      id: s.id,
      title: s.title,
      purpose: s.purpose,
      fragmentIds: s.fragmentIds,
      missingMaterial: s.missingMaterial,
    })),
  }

  const idea = await db.select().from(ideas).where(eq(ideas.id, input.ideaId)).limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
  }

  const existing = await db
    .select()
    .from(drafts)
    .where(eq(drafts.ideaId, input.ideaId))
    .limit(1)

  const now = new Date()
  let draftId: string

  const skeleton = outlineToMarkdownSkeleton({
    outline,
    confirmedClaim: idea[0].confirmedClaim,
  })

  await db.transaction(async (tx) => {
    if (existing[0]) {
      draftId = existing[0].id
      const shouldSeedBody = !existing[0].content?.trim()
      await tx
        .update(drafts)
        .set({
          title: option.title || existing[0].title,
          outlineJson: outline,
          ...(shouldSeedBody ? { content: skeleton } : {}),
          revision: sql`${drafts.revision} + 1`,
          updatedAt: now,
          sourceStaleAt: null,
          sourceStaleReason: null,
        })
        .where(eq(drafts.id, draftId))
    } else {
      draftId = createId('draft')
      await tx.insert(drafts).values({
        id: draftId,
        ideaId: input.ideaId,
        title: option.title || idea[0]!.name,
        outlineJson: outline,
        content: skeleton,
        status: 'drafting',
        revision: 1,
        tagsJson: [],
        createdAt: now,
        updatedAt: now,
      })
    }

    await tx
      .update(aiGenerations)
      .set({ resolution: 'accepted', resolvedAt: now })
      .where(eq(aiGenerations.id, input.generationId))

    await tx
      .update(aiGenerations)
      .set({ resolution: 'superseded', resolvedAt: now })
      .where(
        and(
          eq(aiGenerations.ideaId, input.ideaId),
          eq(aiGenerations.operation, 'outline'),
          eq(aiGenerations.resolution, 'pending'),
          sql`${aiGenerations.id} <> ${input.generationId}`,
        ),
      )
  })

  return { draftId: draftId!, outline }
}

export async function generateDraft(db: Db, input: { ideaId: string; draftId: string }) {
  await assertNoPending(db, {
    ideaId: input.ideaId,
    draftId: input.draftId,
    operation: 'draft',
  })

  const { idea, fragments: frags } = await loadIdeaFragments(db, input.ideaId)
  if (!idea.confirmedClaim?.trim()) {
    throw Object.assign(new Error('请先确认主张'), { code: 'VALIDATION_ERROR' })
  }

  const draft = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, input.draftId), eq(drafts.ideaId, input.ideaId)))
    .limit(1)
  if (!draft[0]) {
    throw Object.assign(new Error('草稿不存在'), { code: 'NOT_FOUND' })
  }

  const policy = resolveModelPolicy('draft')
  const fragmentsXml = serializeFragments(
    frags.map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  )
  const outline = (draft[0].outlineJson || emptyOutline(draft[0].title)) as Outline
  const built = buildDraftPrompt({
    ideaName: idea.name,
    confirmedClaim: idea.confirmedClaim,
    outlineJson: JSON.stringify(outline, null, 2),
    fragmentsXml,
  })

  const genId = await insertPending(db, {
    operation: 'draft',
    ideaId: input.ideaId,
    draftId: input.draftId,
    fragmentIds: frags.map((f) => f.id),
    snapshot: {
      ideaRevision: idea.revision,
      draftRevision: draft[0].revision,
      claim: idea.confirmedClaim,
    },
    promptVersion: `${PROMPT_VERSIONS.base}+${built.promptVersion}`,
    model: policy.model,
    reasoning: policy.reasoning,
  })

  const provider = getAiProvider()
  console.info('[ai] generateDraft start', {
    ideaId: input.ideaId,
    draftId: input.draftId,
    generationId: genId,
    model: policy.model,
  })

  // Prefer streaming provider path and accumulate (progressive server-side collect).
  let text = ''
  let cancelled = false
  try {
    for await (const event of provider.streamText({
      operation: 'draft',
      system: built.system,
      prompt: built.prompt,
      timeoutMs: policy.timeoutMs,
    })) {
      if (event.type === 'text-delta') text += event.textDelta
      if (event.type === 'error') {
        cancelled = event.message === 'cancelled'
        if (!cancelled) {
          await finishGeneration(db, {
            id: genId,
            status: 'failed',
            errorCode: 'AI_UNAVAILABLE',
            errorMessage: event.message,
            model: policy.model,
          })
          throw Object.assign(new Error(event.message), { code: 'AI_UNAVAILABLE' })
        }
        break
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) throw error
    const message = error instanceof Error ? error.message : '生成初稿失败'
    await finishGeneration(db, {
      id: genId,
      status: 'failed',
      errorCode: 'AI_UNAVAILABLE',
      errorMessage: message,
      model: policy.model,
    })
    throw Object.assign(new Error(message), { code: 'AI_UNAVAILABLE' })
  }

  if (cancelled || !text.trim()) {
    // Fallback to non-stream generateText if stream produced nothing
    const result = await provider.generateText({
      operation: 'draft',
      system: built.system,
      prompt: built.prompt,
      timeoutMs: policy.timeoutMs,
    })
    if (!result.ok) {
      await finishGeneration(db, {
        id: genId,
        status: result.code === 'CANCELLED' ? 'cancelled' : 'failed',
        errorCode: result.code,
        errorMessage: result.message,
        model: result.model || policy.model,
      })
      throw Object.assign(new Error(result.message), { code: result.code })
    }
    text = result.data
  }

  await finishGeneration(db, {
    id: genId,
    status: 'succeeded',
    outputText: text,
    model: policy.model,
  })

  console.info('[ai] generateDraft ok', {
    generationId: genId,
    chars: text.length,
  })

  return {
    generation: await getGeneration(db, genId),
    draftText: text,
  }
}

export async function acceptDraftGeneration(
  db: Db,
  input: {
    generationId: string
    draftId: string
    baseRevision: number
  },
) {
  const gen = await getGenerationRow(db, input.generationId)
  if (gen.operation !== 'draft' || gen.draftId !== input.draftId) {
    throw Object.assign(new Error('生成结果不匹配'), { code: 'VALIDATION_ERROR' })
  }
  if (gen.executionStatus !== 'succeeded' || !gen.outputText) {
    throw Object.assign(new Error('没有可接受的初稿'), { code: 'VALIDATION_ERROR' })
  }
  if (gen.resolution === 'accepted') {
    throw Object.assign(new Error('该初稿已接受'), { code: 'VALIDATION_ERROR' })
  }

  const updated = await db
    .update(drafts)
    .set({
      content: gen.outputText,
      revision: sql`${drafts.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(drafts.id, input.draftId), eq(drafts.revision, input.baseRevision)))
    .returning()

  if (!updated[0]) {
    throw Object.assign(new Error('草稿已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
    })
  }

  const now = new Date()
  await db
    .update(aiGenerations)
    .set({ resolution: 'accepted', resolvedAt: now })
    .where(eq(aiGenerations.id, input.generationId))

  await db
    .update(aiGenerations)
    .set({ resolution: 'superseded', resolvedAt: now })
    .where(
      and(
        eq(aiGenerations.draftId, input.draftId),
        eq(aiGenerations.operation, 'draft'),
        eq(aiGenerations.resolution, 'pending'),
        sql`${aiGenerations.id} <> ${input.generationId}`,
      ),
    )

  return {
    draftId: input.draftId,
    revision: updated[0].revision,
    content: updated[0].content,
  }
}

export async function acceptClaim(
  db: Db,
  input: {
    ideaId: string
    generationId: string
    claimText: string
    baseRevision: number
  },
) {
  const claim = input.claimText.trim()
  if (!claim) {
    throw Object.assign(new Error('主张不能为空'), { code: 'VALIDATION_ERROR' })
  }

  const gen = await getGenerationRow(db, input.generationId)
  if (gen.ideaId !== input.ideaId || gen.operation !== 'claim') {
    throw Object.assign(new Error('生成结果不匹配'), { code: 'VALIDATION_ERROR' })
  }

  const updated = await db
    .update(ideas)
    .set({
      confirmedClaim: claim,
      claimSourceGenerationId: input.generationId,
      revision: sql`${ideas.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(ideas.id, input.ideaId), eq(ideas.revision, input.baseRevision)))
    .returning()

  if (!updated[0]) {
    throw Object.assign(new Error('想法已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
    })
  }

  const now = new Date()
  await db
    .update(aiGenerations)
    .set({ resolution: 'accepted', resolvedAt: now })
    .where(eq(aiGenerations.id, input.generationId))

  // Mark draft stale if exists
  await db
    .update(drafts)
    .set({
      sourceStaleAt: now,
      sourceStaleReason: 'claim_changed',
    })
    .where(eq(drafts.ideaId, input.ideaId))

  return {
    ideaId: input.ideaId,
    confirmedClaim: claim,
    revision: updated[0].revision,
  }
}

export async function rejectGeneration(db: Db, generationId: string) {
  const gen = await getGenerationRow(db, generationId)
  if (gen.resolution !== 'pending') {
    throw Object.assign(new Error('该结果已处理'), { code: 'VALIDATION_ERROR' })
  }
  await db
    .update(aiGenerations)
    .set({ resolution: 'rejected', resolvedAt: new Date() })
    .where(eq(aiGenerations.id, generationId))
  return { id: generationId }
}

export type SelectionAiInput = {
  ideaId: string
  draftId: string
  operation: SelectionOp
  draftRevision: number
  selectionFrom: number
  selectionTo: number
  selectedText: string
  selectionHash: string
  contextBefore?: string
  contextAfter?: string
  userInstruction?: string | null
  mustKeepPhrases?: string[]
}

export async function runSelectionAi(db: Db, input: SelectionAiInput) {
  const selection = input.selectedText
  if (!selection.trim()) {
    throw Object.assign(new Error('请先选中一段文字'), {
      code: 'VALIDATION_ERROR',
    })
  }
  if (input.selectionFrom < 0 || input.selectionTo <= input.selectionFrom) {
    throw Object.assign(new Error('选区范围无效'), { code: 'VALIDATION_ERROR' })
  }

  const expectedHash = await hashText(selection)
  if (expectedHash !== input.selectionHash) {
    throw Object.assign(new Error('选区内容校验失败，请重新选择'), {
      code: 'STALE_AI_SUGGESTION',
    })
  }

  const draft = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, input.draftId), eq(drafts.ideaId, input.ideaId)))
    .limit(1)
  if (!draft[0]) {
    throw Object.assign(new Error('草稿不存在'), { code: 'NOT_FOUND' })
  }
  if (draft[0].revision !== input.draftRevision) {
    throw Object.assign(new Error('草稿已更新，请刷新后再试选区 AI'), {
      code: 'STALE_AI_SUGGESTION',
      details: { serverRevision: draft[0].revision },
    })
  }

  const slice = draft[0].content.slice(input.selectionFrom, input.selectionTo)
  if (slice !== selection) {
    throw Object.assign(new Error('选区与当前正文不一致，请重新选择'), {
      code: 'STALE_AI_SUGGESTION',
    })
  }

  await assertNoPending(db, {
    draftId: input.draftId,
    operation: input.operation,
  })

  const { idea, fragments: frags } = await loadIdeaFragments(db, input.ideaId)
  const policy = resolveModelPolicy(input.operation)
  const fragmentsXml = serializeFragments(
    frags.slice(0, 12).map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  )
  const built = buildSelectionPrompt({
    operation: input.operation,
    ideaName: idea.name,
    confirmedClaim: idea.confirmedClaim,
    selection,
    contextBefore: input.contextBefore ?? '',
    contextAfter: input.contextAfter ?? '',
    userInstruction: input.userInstruction,
    mustKeepPhrases: input.mustKeepPhrases,
    fragmentsXml,
  })

  const genId = await insertPending(db, {
    operation: input.operation,
    ideaId: input.ideaId,
    draftId: input.draftId,
    fragmentIds: frags.map((f) => f.id),
    snapshot: {
      draftRevision: input.draftRevision,
      selectionFrom: input.selectionFrom,
      selectionTo: input.selectionTo,
      selectionHash: input.selectionHash,
      selectedText: selection,
      operation: input.operation,
    },
    promptVersion: `${PROMPT_VERSIONS.base}+${built.promptVersion}`,
    model: policy.model,
    reasoning: policy.reasoning,
  })

  const provider = getAiProvider()

  console.info('[ai] selection start', {
    operation: input.operation,
    generationId: genId,
    draftId: input.draftId,
  })

  const fail = async (
    code: string,
    message: string,
    model?: string,
  ): Promise<never> => {
    await finishGeneration(db, {
      id: genId,
      status: code === 'CANCELLED' ? 'cancelled' : 'failed',
      errorCode: code,
      errorMessage: message,
      model: model || policy.model,
    })
    throw Object.assign(new Error(message), { code })
  }

  if (input.operation === 'feedback') {
    const result = await provider.generateObject({
      operation: input.operation,
      system: built.system,
      prompt: built.prompt,
      schema: selectionFeedbackSchema,
      timeoutMs: policy.timeoutMs,
    })
    if (!result.ok) {
      console.error('[ai] selection failed', result)
      return await fail(result.code, result.message, result.model)
    }
    await finishGeneration(db, {
      id: genId,
      status: 'succeeded',
      outputJson: result.data,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model,
    })
    return {
      generation: await getGeneration(db, genId),
      operation: input.operation,
      selectionFrom: input.selectionFrom,
      selectionTo: input.selectionTo,
      selectionHash: input.selectionHash,
      originalText: selection,
      result: result.data,
    }
  }

  const result = await provider.generateObject({
    operation: input.operation,
    system: built.system,
    prompt: built.prompt,
    schema: selectionRewriteSchema,
    timeoutMs: policy.timeoutMs,
  })
  if (!result.ok) {
    console.error('[ai] selection failed', result)
    return await fail(result.code, result.message, result.model)
  }
  await finishGeneration(db, {
    id: genId,
    status: 'succeeded',
    outputJson: result.data,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  })

  console.info('[ai] selection ok', {
    generationId: genId,
    operation: input.operation,
  })

  return {
    generation: await getGeneration(db, genId),
    operation: input.operation,
    selectionFrom: input.selectionFrom,
    selectionTo: input.selectionTo,
    selectionHash: input.selectionHash,
    originalText: selection,
    result: result.data,
  }
}

export async function acceptSelectionRewrite(
  db: Db,
  input: {
    generationId: string
    draftId: string
    baseRevision: number
    selectionFrom: number
    selectionTo: number
    selectionHash: string
  },
) {
  const gen = await getGenerationRow(db, input.generationId)
  if (gen.draftId !== input.draftId) {
    throw Object.assign(new Error('生成结果不匹配'), { code: 'VALIDATION_ERROR' })
  }
  if (!['organize', 'expand', 'polish'].includes(gen.operation)) {
    throw Object.assign(new Error('该生成不是可应用的选区改写'), {
      code: 'VALIDATION_ERROR',
    })
  }
  if (gen.executionStatus !== 'succeeded') {
    throw Object.assign(new Error('生成尚未成功'), { code: 'VALIDATION_ERROR' })
  }
  if (gen.resolution === 'accepted') {
    throw Object.assign(new Error('该建议已接受'), { code: 'VALIDATION_ERROR' })
  }

  const parsed = selectionRewriteSchema.safeParse(gen.outputJson)
  if (!parsed.success) {
    throw Object.assign(new Error('改写结果无效'), { code: 'AI_OUTPUT_INVALID' })
  }

  const draft = await db
    .select()
    .from(drafts)
    .where(eq(drafts.id, input.draftId))
    .limit(1)
  if (!draft[0]) {
    throw Object.assign(new Error('草稿不存在'), { code: 'NOT_FOUND' })
  }
  if (draft[0].revision !== input.baseRevision) {
    throw Object.assign(new Error('草稿已更新，无法安全应用选区建议'), {
      code: 'STALE_AI_SUGGESTION',
      details: { serverRevision: draft[0].revision },
    })
  }

  const currentSlice = draft[0].content.slice(
    input.selectionFrom,
    input.selectionTo,
  )
  const currentHash = await hashText(currentSlice)
  if (currentHash !== input.selectionHash) {
    throw Object.assign(new Error('选区文字已变化，请重新生成建议'), {
      code: 'STALE_AI_SUGGESTION',
    })
  }

  const nextContent =
    draft[0].content.slice(0, input.selectionFrom) +
    parsed.data.rewrittenText +
    draft[0].content.slice(input.selectionTo)

  const updated = await db
    .update(drafts)
    .set({
      content: nextContent,
      revision: sql`${drafts.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(drafts.id, input.draftId), eq(drafts.revision, input.baseRevision)))
    .returning()

  if (!updated[0]) {
    throw Object.assign(new Error('草稿已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
    })
  }

  const now = new Date()
  await db
    .update(aiGenerations)
    .set({ resolution: 'accepted', resolvedAt: now })
    .where(eq(aiGenerations.id, input.generationId))

  await db
    .update(aiGenerations)
    .set({ resolution: 'superseded', resolvedAt: now })
    .where(
      and(
        eq(aiGenerations.draftId, input.draftId),
        inArray(aiGenerations.operation, ['organize', 'expand', 'polish']),
        eq(aiGenerations.resolution, 'pending'),
        sql`${aiGenerations.id} <> ${input.generationId}`,
      ),
    )

  return {
    draftId: input.draftId,
    revision: updated[0].revision,
    content: updated[0].content,
    appliedFrom: input.selectionFrom,
    appliedTo: input.selectionFrom + parsed.data.rewrittenText.length,
    previousText: currentSlice,
    nextText: parsed.data.rewrittenText,
  }
}

export async function getGeneration(db: Db, id: string) {
  return mapGeneration(await getGenerationRow(db, id))
}

async function getGenerationRow(db: Db, id: string) {
  const row = await db.select().from(aiGenerations).where(eq(aiGenerations.id, id)).limit(1)
  if (!row[0]) {
    throw Object.assign(new Error('生成记录不存在'), { code: 'NOT_FOUND' })
  }
  return row[0]
}
