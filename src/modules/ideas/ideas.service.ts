import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { markIdeaDraftsStale } from '#/modules/drafts/drafts.service'
import type { FragmentRecord } from '#/modules/fragments/fragments.service'
import type { Db } from '#/server/db/client.server'
import {
  drafts,
  emptyOutline,
  fragments,
  ideaFragments,
  ideas,
} from '#/server/db/schema'
import { createId } from '#/shared/ids'

export type IdeaListItem = {
  id: string
  name: string
  description: string | null
  confirmedClaim: string | null
  revision: number
  fragmentCount: number
  hasDraft: boolean
  draftId: string | null
  createdAt: string
  updatedAt: string
}

export type IdeaWorkspace = {
  idea: IdeaListItem
  fragments: FragmentRecord[]
  draft: {
    id: string
    title: string
    status: 'drafting' | 'completed'
    revision: number
  } | null
}

function toIso(d: Date) {
  return d.toISOString()
}

export async function listIdeas(db: Db): Promise<IdeaListItem[]> {
  const rows = await db.select().from(ideas).orderBy(desc(ideas.updatedAt))
  if (rows.length === 0) return []

  const ideaIds = rows.map((r) => r.id)
  const counts = await db
    .select({
      ideaId: ideaFragments.ideaId,
      count: sql<number>`count(*)::int`,
    })
    .from(ideaFragments)
    .where(inArray(ideaFragments.ideaId, ideaIds))
    .groupBy(ideaFragments.ideaId)

  const draftRows = await db
    .select({ id: drafts.id, ideaId: drafts.ideaId })
    .from(drafts)
    .where(inArray(drafts.ideaId, ideaIds))

  const countMap = new Map(counts.map((c) => [c.ideaId, c.count]))
  const draftMap = new Map(draftRows.map((d) => [d.ideaId, d.id]))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    confirmedClaim: row.confirmedClaim,
    revision: row.revision,
    fragmentCount: countMap.get(row.id) ?? 0,
    hasDraft: draftMap.has(row.id),
    draftId: draftMap.get(row.id) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }))
}

export async function createIdea(
  db: Db,
  input: {
    name: string
    description?: string | null
    fragmentIds?: string[]
  },
): Promise<IdeaListItem> {
  const name = input.name.trim()
  if (!name) {
    throw Object.assign(new Error('名称不能为空'), { code: 'VALIDATION_ERROR' })
  }

  const now = new Date()
  const id = createId('idea')
  const fragmentIds = [...new Set(input.fragmentIds ?? [])]

  await db.transaction(async (tx) => {
    await tx.insert(ideas).values({
      id,
      name,
      description: input.description?.trim() || null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })

    if (fragmentIds.length > 0) {
      const existing = await tx
        .select({ id: fragments.id })
        .from(fragments)
        .where(inArray(fragments.id, fragmentIds))
      if (existing.length !== fragmentIds.length) {
        throw Object.assign(new Error('部分碎片不存在'), { code: 'NOT_FOUND' })
      }
      await tx.insert(ideaFragments).values(
        fragmentIds.map((fragmentId) => ({
          ideaId: id,
          fragmentId,
          createdAt: now,
        })),
      )
    }
  })

  const listed = await listIdeas(db)
  return listed.find((i) => i.id === id)!
}

export async function updateIdea(
  db: Db,
  input: {
    id: string
    baseRevision: number
    name?: string
    description?: string | null
    confirmedClaim?: string | null
  },
): Promise<IdeaListItem> {
  const patch: {
    name?: string
    description?: string | null
    confirmedClaim?: string | null
    revision: ReturnType<typeof sql>
    updatedAt: Date
  } = {
    revision: sql`${ideas.revision} + 1`,
    updatedAt: new Date(),
  }

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) {
      throw Object.assign(new Error('名称不能为空'), { code: 'VALIDATION_ERROR' })
    }
    patch.name = name
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null
  }
  const claimChanging = input.confirmedClaim !== undefined

  if (input.confirmedClaim !== undefined) {
    patch.confirmedClaim = input.confirmedClaim?.trim() || null
  }

  const updated = await db
    .update(ideas)
    .set(patch)
    .where(and(eq(ideas.id, input.id), eq(ideas.revision, input.baseRevision)))
    .returning()

  if (!updated[0]) {
    const current = await db.select().from(ideas).where(eq(ideas.id, input.id)).limit(1)
    if (!current[0]) {
      throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
    }
    throw Object.assign(new Error('想法已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
    })
  }

  if (claimChanging) {
    await markIdeaDraftsStale(db, input.id, 'claim_changed')
  }

  const listed = await listIdeas(db)
  return listed.find((i) => i.id === input.id)!
}

export async function addIdeaFragments(
  db: Db,
  input: { ideaId: string; fragmentIds: string[] },
) {
  const idea = await db.select().from(ideas).where(eq(ideas.id, input.ideaId)).limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
  }

  const fragmentIds = [...new Set(input.fragmentIds)]
  if (fragmentIds.length === 0) {
    return { added: 0 }
  }

  const existing = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(inArray(fragments.id, fragmentIds))
  if (existing.length !== fragmentIds.length) {
    throw Object.assign(new Error('部分碎片不存在'), { code: 'NOT_FOUND' })
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    for (const fragmentId of fragmentIds) {
      await tx
        .insert(ideaFragments)
        .values({ ideaId: input.ideaId, fragmentId, createdAt: now })
        .onConflictDoNothing()
    }
    await tx
      .update(ideas)
      .set({
        revision: sql`${ideas.revision} + 1`,
        updatedAt: now,
      })
      .where(eq(ideas.id, input.ideaId))
  })

  await markIdeaDraftsStale(db, input.ideaId, 'material_changed')
  return { added: fragmentIds.length }
}

export async function removeIdeaFragment(
  db: Db,
  input: { ideaId: string; fragmentId: string },
) {
  const deleted = await db
    .delete(ideaFragments)
    .where(
      and(
        eq(ideaFragments.ideaId, input.ideaId),
        eq(ideaFragments.fragmentId, input.fragmentId),
      ),
    )
    .returning()

  if (!deleted[0]) {
    throw Object.assign(new Error('关联不存在'), { code: 'NOT_FOUND' })
  }

  await db
    .update(ideas)
    .set({
      revision: sql`${ideas.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(ideas.id, input.ideaId))

  await markIdeaDraftsStale(db, input.ideaId, 'material_changed')
  return { removed: true }
}

export async function previewDeleteIdea(db: Db, ideaId: string) {
  const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
  }

  const fragmentCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ideaFragments)
    .where(eq(ideaFragments.ideaId, ideaId))

  const draft = await db
    .select({ id: drafts.id, title: drafts.title })
    .from(drafts)
    .where(eq(drafts.ideaId, ideaId))
    .limit(1)

  return {
    ideaId,
    name: idea[0].name,
    fragmentCount: fragmentCount[0]?.count ?? 0,
    draft: draft[0] ?? null,
    requiresDeleteDraft: Boolean(draft[0]),
  }
}

export async function deleteIdea(
  db: Db,
  input: { ideaId: string; deleteDraft?: boolean },
) {
  const preview = await previewDeleteIdea(db, input.ideaId)

  const draft = preview.draft
  if (draft && !input.deleteDraft) {
    throw Object.assign(new Error('该想法已有草稿，需显式确认同时删除'), {
      code: 'DELETE_RESTRICTED',
      details: { draftId: draft.id },
    })
  }

  await db.transaction(async (tx) => {
    if (draft && input.deleteDraft) {
      await tx.delete(drafts).where(eq(drafts.ideaId, input.ideaId))
    }
    await tx.delete(ideas).where(eq(ideas.id, input.ideaId))
  })

  return { id: input.ideaId }
}

export async function getIdeaWorkspace(
  db: Db,
  ideaId: string,
): Promise<IdeaWorkspace> {
  const listed = await listIdeas(db)
  const idea = listed.find((i) => i.id === ideaId)
  if (!idea) {
    throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
  }

  const links = await db
    .select({
      id: fragments.id,
      content: fragments.content,
      revision: fragments.revision,
      createdAt: fragments.createdAt,
      updatedAt: fragments.updatedAt,
    })
    .from(ideaFragments)
    .innerJoin(fragments, eq(fragments.id, ideaFragments.fragmentId))
    .where(eq(ideaFragments.ideaId, ideaId))
    .orderBy(fragments.createdAt, fragments.id)

  const draftRow = await db
    .select({
      id: drafts.id,
      title: drafts.title,
      status: drafts.status,
      revision: drafts.revision,
    })
    .from(drafts)
    .where(eq(drafts.ideaId, ideaId))
    .limit(1)

  return {
    idea,
    fragments: links.map((row) => ({
      id: row.id,
      content: row.content,
      revision: row.revision,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      ideaIds: [ideaId],
      ideaNames: [idea.name],
    })),
    draft: draftRow[0]
      ? {
          id: draftRow[0].id,
          title: draftRow[0].title,
          status: draftRow[0].status,
          revision: draftRow[0].revision,
        }
      : null,
  }
}

/** Ensure a blank draft work copy exists for an Idea (Slice 1 manual path). */
export async function ensureBlankDraft(db: Db, ideaId: string) {
  const existing = await db
    .select()
    .from(drafts)
    .where(eq(drafts.ideaId, ideaId))
    .limit(1)
  if (existing[0]) {
    return existing[0]
  }

  const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('想法不存在'), { code: 'NOT_FOUND' })
  }

  const now = new Date()
  const id = createId('draft')
  const title = idea[0].name || '未命名草稿'
  await db.insert(drafts).values({
    id,
    ideaId,
    title,
    outlineJson: emptyOutline(title),
    content: '',
    status: 'drafting',
    revision: 1,
    tagsJson: [],
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  if (!created[0]) {
    throw Object.assign(new Error('创建草稿失败'), { code: 'INTERNAL_ERROR' })
  }
  return created[0]
}
