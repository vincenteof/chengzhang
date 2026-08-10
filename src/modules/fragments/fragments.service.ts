import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { Db } from '#/server/db/client.server'
import { fragments, ideaFragments, ideas } from '#/server/db/schema'
import { createId } from '#/shared/ids'

export type FragmentRecord = {
  id: string
  content: string
  revision: number
  createdAt: string
  updatedAt: string
  ideaIds: string[]
  ideaNames: string[]
}

function toIso(d: Date) {
  return d.toISOString()
}

export async function listFragments(
  db: Db,
  options: { unassignedOnly?: boolean; limit?: number } = {},
): Promise<FragmentRecord[]> {
  const limit = options.limit ?? 200

  let rows
  if (options.unassignedOnly) {
    rows = await db
      .select({
        id: fragments.id,
        captureRequestId: fragments.captureRequestId,
        content: fragments.content,
        revision: fragments.revision,
        createdAt: fragments.createdAt,
        updatedAt: fragments.updatedAt,
      })
      .from(fragments)
      .leftJoin(ideaFragments, eq(ideaFragments.fragmentId, fragments.id))
      .where(sql`${ideaFragments.fragmentId} is null`)
      .orderBy(desc(fragments.createdAt))
      .limit(limit)
  } else {
    rows = await db
      .select()
      .from(fragments)
      .orderBy(desc(fragments.createdAt))
      .limit(limit)
  }

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const links = await db
    .select({
      fragmentId: ideaFragments.fragmentId,
      ideaId: ideas.id,
      ideaName: ideas.name,
    })
    .from(ideaFragments)
    .innerJoin(ideas, eq(ideas.id, ideaFragments.ideaId))
    .where(inArray(ideaFragments.fragmentId, ids))

  const byFragment = new Map<string, { ideaIds: string[]; ideaNames: string[] }>()
  for (const link of links) {
    const entry = byFragment.get(link.fragmentId) ?? {
      ideaIds: [],
      ideaNames: [],
    }
    entry.ideaIds.push(link.ideaId)
    entry.ideaNames.push(link.ideaName)
    byFragment.set(link.fragmentId, entry)
  }

  return rows.map((row) => {
    const meta = byFragment.get(row.id)
    return {
      id: row.id,
      content: row.content,
      revision: row.revision,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      ideaIds: meta?.ideaIds ?? [],
      ideaNames: meta?.ideaNames ?? [],
    }
  })
}

export async function createFragment(
  db: Db,
  input: { content: string; captureRequestId: string },
): Promise<FragmentRecord> {
  const content = input.content.trim()
  if (!content) {
    throw Object.assign(new Error('内容不能为空'), { code: 'VALIDATION_ERROR' })
  }
  if (!input.captureRequestId.trim()) {
    throw Object.assign(new Error('缺少 captureRequestId'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const existing = await db
    .select()
    .from(fragments)
    .where(eq(fragments.captureRequestId, input.captureRequestId))
    .limit(1)

  if (existing[0]) {
    const list = await listFragmentsByIds(db, [existing[0].id])
    const found = list[0]
    if (!found) {
      throw Object.assign(new Error('碎片不存在'), { code: 'NOT_FOUND' })
    }
    return found
  }

  const now = new Date()
  const id = createId('frag')
  await db.insert(fragments).values({
    id,
    content,
    captureRequestId: input.captureRequestId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })

  return {
    id,
    content,
    revision: 1,
    createdAt: toIso(now),
    updatedAt: toIso(now),
    ideaIds: [],
    ideaNames: [],
  }
}

export async function updateFragment(
  db: Db,
  input: { id: string; content: string; baseRevision: number },
): Promise<FragmentRecord> {
  const content = input.content.trim()
  if (!content) {
    throw Object.assign(new Error('内容不能为空'), { code: 'VALIDATION_ERROR' })
  }

  const now = new Date()
  const updated = await db
    .update(fragments)
    .set({
      content,
      revision: sql`${fragments.revision} + 1`,
      updatedAt: now,
    })
    .where(
      and(eq(fragments.id, input.id), eq(fragments.revision, input.baseRevision)),
    )
    .returning()

  if (!updated[0]) {
    const current = await db
      .select()
      .from(fragments)
      .where(eq(fragments.id, input.id))
      .limit(1)
    if (!current[0]) {
      throw Object.assign(new Error('碎片不存在'), { code: 'NOT_FOUND' })
    }
    throw Object.assign(new Error('碎片已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
    })
  }

  const list = await listFragmentsByIds(db, [input.id])
  const found = list[0]
  if (!found) {
    throw Object.assign(new Error('碎片不存在'), { code: 'NOT_FOUND' })
  }
  return found
}

export async function previewDeleteFragment(db: Db, id: string) {
  const row = await db.select().from(fragments).where(eq(fragments.id, id)).limit(1)
  if (!row[0]) {
    throw Object.assign(new Error('碎片不存在'), { code: 'NOT_FOUND' })
  }

  const links = await db
    .select({
      ideaId: ideas.id,
      ideaName: ideas.name,
    })
    .from(ideaFragments)
    .innerJoin(ideas, eq(ideas.id, ideaFragments.ideaId))
    .where(eq(ideaFragments.fragmentId, id))

  return {
    fragmentId: id,
    ideaCount: links.length,
    ideas: links,
  }
}

export async function deleteFragment(db: Db, id: string) {
  const deleted = await db
    .delete(fragments)
    .where(eq(fragments.id, id))
    .returning({ id: fragments.id })
  if (!deleted[0]) {
    throw Object.assign(new Error('碎片不存在'), { code: 'NOT_FOUND' })
  }
  return { id }
}

async function listFragmentsByIds(db: Db, ids: string[]): Promise<FragmentRecord[]> {
  if (ids.length === 0) return []
  const rows = await db.select().from(fragments).where(inArray(fragments.id, ids))
  const links = await db
    .select({
      fragmentId: ideaFragments.fragmentId,
      ideaId: ideas.id,
      ideaName: ideas.name,
    })
    .from(ideaFragments)
    .innerJoin(ideas, eq(ideas.id, ideaFragments.ideaId))
    .where(inArray(ideaFragments.fragmentId, ids))

  const byFragment = new Map<string, { ideaIds: string[]; ideaNames: string[] }>()
  for (const link of links) {
    const entry = byFragment.get(link.fragmentId) ?? {
      ideaIds: [],
      ideaNames: [],
    }
    entry.ideaIds.push(link.ideaId)
    entry.ideaNames.push(link.ideaName)
    byFragment.set(link.fragmentId, entry)
  }

  return rows.map((row) => {
    const meta = byFragment.get(row.id)
    return {
      id: row.id,
      content: row.content,
      revision: row.revision,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      ideaIds: meta?.ideaIds ?? [],
      ideaNames: meta?.ideaNames ?? [],
    }
  })
}

