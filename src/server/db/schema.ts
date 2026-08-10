import { sql } from 'drizzle-orm'
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}

export const fragments = pgTable(
  'fragments',
  {
    id: text('id').primaryKey(),
    captureRequestId: text('capture_request_id'),
    content: text('content').notNull(),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('fragments_capture_request_id_uidx').on(t.captureRequestId),
    index('fragments_created_at_idx').on(t.createdAt),
  ],
)

export const ideas = pgTable('ideas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  confirmedClaim: text('confirmed_claim'),
  claimSourceGenerationId: text('claim_source_generation_id'),
  revision: integer('revision').notNull().default(1),
  ...timestamps,
})

export const ideaFragments = pgTable(
  'idea_fragments',
  {
    ideaId: text('idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    fragmentId: text('fragment_id')
      .notNull()
      .references(() => fragments.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ideaId, t.fragmentId] }),
    index('idea_fragments_fragment_id_idx').on(t.fragmentId),
  ],
)

export const drafts = pgTable(
  'drafts',
  {
    id: text('id').primaryKey(),
    ideaId: text('idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'restrict' })
      .unique(),
    title: text('title').notNull(),
    description: text('description'),
    slug: text('slug'),
    tagsJson: jsonb('tags_json').$type<string[]>().notNull().default([]),
    outlineJson: jsonb('outline_json')
      .$type<Outline>()
      .notNull()
      .default(
        sql`'{"schemaVersion":1,"title":"","approach":"","sections":[]}'::jsonb`,
      ),
    content: text('content').notNull().default(''),
    status: text('status').$type<'drafting' | 'completed'>().notNull().default('drafting'),
    revision: integer('revision').notNull().default(1),
    sourceStaleAt: timestamp('source_stale_at', { withTimezone: true }),
    sourceStaleReason: text('source_stale_reason'),
    ...timestamps,
  },
  (t) => [index('drafts_idea_id_idx').on(t.ideaId)],
)

export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: text('id').primaryKey(),
    operation: text('operation').notNull(),
    ideaId: text('idea_id'),
    draftId: text('draft_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    reasoning: text('reasoning'),
    promptVersion: text('prompt_version').notNull(),
    inputSnapshotJson: jsonb('input_snapshot_json').notNull(),
    fragmentIdsJson: jsonb('fragment_ids_json').$type<string[]>().notNull(),
    outputJson: jsonb('output_json'),
    outputText: text('output_text'),
    executionStatus: text('execution_status')
      .$type<'pending' | 'succeeded' | 'failed' | 'cancelled'>()
      .notNull(),
    resolution: text('resolution')
      .$type<'pending' | 'accepted' | 'rejected' | 'superseded'>()
      .notNull()
      .default('pending'),
    retryOfId: text('retry_of_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('ai_generations_idea_started_idx').on(t.ideaId, t.startedAt),
    index('ai_generations_draft_started_idx').on(t.draftId, t.startedAt),
  ],
)

export const ideaQuestions = pgTable(
  'idea_questions',
  {
    id: text('id').primaryKey(),
    ideaId: text('idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    generationId: text('generation_id')
      .notNull()
      .references(() => aiGenerations.id),
    question: text('question').notNull(),
    targetGap: text('target_gap'),
    whyItMatters: text('why_it_matters'),
    answeredFragmentId: text('answered_fragment_id').references(
      () => fragments.id,
      { onDelete: 'set null' },
    ),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('idea_questions_idea_dismissed_idx').on(t.ideaId, t.dismissedAt)],
)

export type Outline = {
  schemaVersion: 1
  title: string
  approach: string
  sections: Array<{
    id: string
    title: string
    purpose: string
    fragmentIds: string[]
    missingMaterial: string[]
  }>
}

export const emptyOutline = (title = ''): Outline => ({
  schemaVersion: 1,
  title,
  approach: '',
  sections: [],
})
