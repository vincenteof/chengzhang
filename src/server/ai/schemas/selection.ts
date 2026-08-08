import { z } from 'zod'

import { asString, pick, stringArraySchema } from './zod-helpers'

/** Shared shape for organize / expand / polish text rewrites. */
export const selectionRewriteSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  return {
    rewrittenText: asString(
      pick(row, 'rewrittenText', 'rewritten_text', 'text', 'result', 'content'),
    ),
    summaryOfChange: asString(
      pick(row, 'summaryOfChange', 'summary_of_change', 'summary', 'note'),
    ),
    warnings: pick(row, 'warnings', 'cautions', 'notes') ?? [],
  }
}, z.object({
  rewrittenText: z.string(),
  summaryOfChange: z.string(),
  warnings: stringArraySchema,
}))

export type SelectionRewrite = z.infer<typeof selectionRewriteSchema>

export const selectionFeedbackSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const items = pick(row, 'items', 'feedback', 'points', 'issues') ?? []
  return {
    overall: asString(pick(row, 'overall', 'summary', 'verdict')),
    items: Array.isArray(items) ? items : [],
  }
}, z.object({
  overall: z.string(),
  items: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.preprocess((item) => {
        if (typeof item === 'string') {
          return { kind: 'clarity', detail: item, suggestion: null }
        }
        if (!item || typeof item !== 'object') return item
        const row = item as Record<string, unknown>
        const kindRaw = asString(
          pick(row, 'kind', 'type', 'category'),
          'clarity',
        ).toLowerCase()
        const allowed = new Set([
          'argument',
          'pacing',
          'repetition',
          'clarity',
          'voice',
          'other',
        ])
        return {
          kind: allowed.has(kindRaw) ? kindRaw : 'other',
          detail: asString(pick(row, 'detail', 'description', 'text', 'issue')),
          suggestion:
            pick(row, 'suggestion', 'fix', 'advice') == null
              ? null
              : asString(pick(row, 'suggestion', 'fix', 'advice')),
        }
      }, z.object({
        kind: z.enum([
          'argument',
          'pacing',
          'repetition',
          'clarity',
          'voice',
          'other',
        ]),
        detail: z.string(),
        suggestion: z.string().nullable(),
      })),
    ),
  ),
}))

export type SelectionFeedback = z.infer<typeof selectionFeedbackSchema>
