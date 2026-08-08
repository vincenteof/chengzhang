import { and, eq, sql } from 'drizzle-orm'

import {
  buildMarkdownDocument,
  safeFilename,
} from '#/modules/export/markdown.service'
import type { Db } from '#/server/db/client.server'
import type { Outline } from '#/server/db/schema'
import {
  drafts,
  emptyOutline,
  fragments,
  ideaFragments,
  ideas,
} from '#/server/db/schema'
import { createId } from '#/shared/ids'

export type DraftRecord = {
  id: string
  ideaId: string
  title: string
  description: string | null
  slug: string | null
  tags: string[]
  outline: Outline
  content: string
  status: 'drafting' | 'completed'
  revision: number
  sourceStaleAt: string | null
  sourceStaleReason: string | null
  createdAt: string
  updatedAt: string
}

function toIso(d: Date | null) {
  return d ? d.toISOString() : null
}

function mapDraft(row: typeof drafts.$inferSelect): DraftRecord {
  return {
    id: row.id,
    ideaId: row.ideaId,
    title: row.title,
    description: row.description,
    slug: row.slug,
    tags: row.tagsJson ?? [],
    outline: row.outlineJson,
    content: row.content,
    status: row.status,
    revision: row.revision,
    sourceStaleAt: toIso(row.sourceStaleAt),
    sourceStaleReason: row.sourceStaleReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getDraft(db: Db, draftId: string): Promise<DraftRecord> {
  const row = await db.select().from(drafts).where(eq(drafts.id, draftId)).limit(1)
  if (!row[0]) {
    throw Object.assign(new Error('草稿不存在'), { code: 'NOT_FOUND' })
  }
  return mapDraft(row[0])
}

export async function getDraftByIdea(
  db: Db,
  ideaId: string,
): Promise<DraftRecord | null> {
  const row = await db.select().from(drafts).where(eq(drafts.ideaId, ideaId)).limit(1)
  return row[0] ? mapDraft(row[0]) : null
}

export async function createDraftForIdea(
  db: Db,
  input: { ideaId: string; title?: string },
): Promise<DraftRecord> {
  const existing = await getDraftByIdea(db, input.ideaId)
  if (existing) return existing

  const idea = await db.select().from(ideas).where(eq(ideas.id, input.ideaId)).limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('Idea 不存在'), { code: 'NOT_FOUND' })
  }

  const now = new Date()
  const id = createId('draft')
  const title = (input.title?.trim() || idea[0].name || '未命名草稿').trim()

  await db.insert(drafts).values({
    id,
    ideaId: input.ideaId,
    title,
    outlineJson: emptyOutline(title),
    content: '',
    status: 'drafting',
    revision: 1,
    tagsJson: [],
    createdAt: now,
    updatedAt: now,
  })

  return getDraft(db, id)
}

export async function saveDraft(
  db: Db,
  input: {
    id: string
    baseRevision: number
    title?: string
    description?: string | null
    slug?: string | null
    tags?: string[]
    content?: string
    outline?: Outline
  },
): Promise<DraftRecord> {
  const patch: Record<string, unknown> = {
    revision: sql`${drafts.revision} + 1`,
    updatedAt: new Date(),
  }

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) {
      throw Object.assign(new Error('标题不能为空'), { code: 'VALIDATION_ERROR' })
    }
    patch.title = title
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null
  }
  if (input.slug !== undefined) {
    patch.slug = input.slug?.trim() || null
  }
  if (input.tags !== undefined) {
    patch.tagsJson = input.tags
  }
  if (input.content !== undefined) {
    patch.content = input.content
  }
  if (input.outline !== undefined) {
    patch.outlineJson = input.outline
  }

  const updated = await db
    .update(drafts)
    .set(patch)
    .where(and(eq(drafts.id, input.id), eq(drafts.revision, input.baseRevision)))
    .returning()

  if (!updated[0]) {
    const current = await db
      .select()
      .from(drafts)
      .where(eq(drafts.id, input.id))
      .limit(1)
    if (!current[0]) {
      throw Object.assign(new Error('草稿不存在'), { code: 'NOT_FOUND' })
    }
    throw Object.assign(new Error('草稿已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
      details: {
        serverRevision: current[0].revision,
        serverContent: current[0].content,
        serverTitle: current[0].title,
      },
    })
  }

  return mapDraft(updated[0])
}

export async function completeDraft(db: Db, input: { id: string; baseRevision: number }) {
  return saveDraftStatus(db, input.id, input.baseRevision, 'completed')
}

export async function reopenDraft(db: Db, input: { id: string; baseRevision: number }) {
  return saveDraftStatus(db, input.id, input.baseRevision, 'drafting')
}

async function saveDraftStatus(
  db: Db,
  id: string,
  baseRevision: number,
  status: 'drafting' | 'completed',
) {
  const updated = await db
    .update(drafts)
    .set({
      status,
      revision: sql`${drafts.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(drafts.id, id), eq(drafts.revision, baseRevision)))
    .returning()

  if (!updated[0]) {
    const current = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
    if (!current[0]) {
      throw Object.assign(new Error('草稿不存在'), { code: 'NOT_FOUND' })
    }
    throw Object.assign(new Error('草稿已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
    })
  }

  return mapDraft(updated[0])
}

export async function exportDraftMarkdown(db: Db, draftId: string) {
  const draft = await getDraft(db, draftId)
  if (!draft.title.trim()) {
    throw Object.assign(new Error('导出前需要标题'), { code: 'VALIDATION_ERROR' })
  }

  const markdown = buildMarkdownDocument(
    {
      title: draft.title,
      description: draft.description,
      slug: draft.slug,
      tags: draft.tags,
    },
    draft.content,
  )

  return {
    markdown,
    filename: `${safeFilename({
      title: draft.title,
      slug: draft.slug,
    })}.md`,
  }
}

export type SourceStaleReason = 'claim_changed' | 'material_changed' | 'outline_changed'

export async function markIdeaDraftsStale(
  db: Db,
  ideaId: string,
  reason: SourceStaleReason,
) {
  await db
    .update(drafts)
    .set({
      sourceStaleAt: new Date(),
      sourceStaleReason: reason,
    })
    .where(eq(drafts.ideaId, ideaId))
}

export async function clearDraftStale(
  db: Db,
  input: { draftId: string; baseRevision: number },
): Promise<DraftRecord> {
  const updated = await db
    .update(drafts)
    .set({
      sourceStaleAt: null,
      sourceStaleReason: null,
      revision: sql`${drafts.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(drafts.id, input.draftId), eq(drafts.revision, input.baseRevision)))
    .returning()

  if (!updated[0]) {
    const current = await db
      .select()
      .from(drafts)
      .where(eq(drafts.id, input.draftId))
      .limit(1)
    if (!current[0]) {
      throw Object.assign(new Error('草稿不存在'), { code: 'NOT_FOUND' })
    }
    throw Object.assign(new Error('草稿已被其他位置更新'), {
      code: 'REVISION_CONFLICT',
    })
  }

  return mapDraft(updated[0])
}

export type DraftEditorContext = {
  draft: DraftRecord
  idea: {
    id: string
    name: string
    confirmedClaim: string | null
  }
  fragments: Array<{ id: string; content: string }>
}

export async function getDraftEditorContext(
  db: Db,
  draftId: string,
): Promise<DraftEditorContext> {
  const draft = await getDraft(db, draftId)
  const idea = await db.select().from(ideas).where(eq(ideas.id, draft.ideaId)).limit(1)
  if (!idea[0]) {
    throw Object.assign(new Error('Idea 不存在'), { code: 'NOT_FOUND' })
  }

  const fragmentRows = await db
    .select({
      id: fragments.id,
      content: fragments.content,
    })
    .from(ideaFragments)
    .innerJoin(fragments, eq(fragments.id, ideaFragments.fragmentId))
    .where(eq(ideaFragments.ideaId, draft.ideaId))
    .orderBy(fragments.createdAt, fragments.id)

  return {
    draft,
    idea: {
      id: idea[0].id,
      name: idea[0].name,
      confirmedClaim: idea[0].confirmedClaim,
    },
    fragments: fragmentRows,
  }
}
