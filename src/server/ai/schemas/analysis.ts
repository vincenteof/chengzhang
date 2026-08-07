import { z } from 'zod'

import { asBoolean, asString, asStringArray, pick, stringArraySchema } from './zod-helpers'

const supportSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  return {
    fragmentId: asString(pick(row, 'fragmentId', 'fragment_id', 'id')),
    howItSupports: asString(
      pick(row, 'howItSupports', 'how_it_supports', 'reason', 'explanation', 'support'),
    ),
  }
}, z.object({
  fragmentId: z.string(),
  howItSupports: z.string(),
}))

const contradictionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const ids = asStringArray(
    pick(row, 'fragmentIds', 'fragment_ids', 'fragments', 'ids') ??
      (row.fragmentId ? [row.fragmentId] : []),
  )
  return {
    fragmentIds: ids.length > 0 ? ids : ['unknown'],
    description: asString(pick(row, 'description', 'summary', 'text', 'detail')),
    isProductiveTension: asBoolean(
      pick(row, 'isProductiveTension', 'is_productive_tension', 'productive', 'useful'),
      true,
    ),
  }
}, z.object({
  fragmentIds: z.array(z.string()).min(1),
  description: z.string(),
  isProductiveTension: z.boolean(),
}))

const repetitionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const ids = asStringArray(
    pick(row, 'fragmentIds', 'fragment_ids', 'fragments', 'ids') ??
      (row.fragmentId ? [row.fragmentId] : []),
  )
  return {
    fragmentIds: ids.length > 0 ? ids : ['unknown'],
    description: asString(pick(row, 'description', 'summary', 'text', 'detail')),
  }
}, z.object({
  fragmentIds: z.array(z.string()).min(1),
  description: z.string(),
}))

const gapKinds = new Set([
  'argument',
  'example',
  'experience',
  'explanation',
  'other',
])

const gapSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return {
      kind: 'other',
      description: value,
      whyItMatters: '',
    }
  }
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const kindRaw = asString(pick(row, 'kind', 'type', 'category'), 'other').toLowerCase()
  const kind = gapKinds.has(kindRaw) ? kindRaw : 'other'
  return {
    kind,
    description: asString(pick(row, 'description', 'gap', 'text', 'detail')),
    whyItMatters: asString(
      pick(row, 'whyItMatters', 'why_it_matters', 'why', 'importance', 'reason'),
    ),
  }
}, z.object({
  kind: z.enum(['argument', 'example', 'experience', 'explanation', 'other']),
  description: z.string(),
  whyItMatters: z.string(),
}))

export const ideaAnalysisSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  return {
    supports: pick(row, 'supports', 'support', 'supporting') ?? [],
    contradictions: pick(row, 'contradictions', 'tensions', 'conflicts') ?? [],
    repetitions: pick(row, 'repetitions', 'duplicates', 'repeats') ?? [],
    gaps: pick(row, 'gaps', 'missing', 'needs') ?? [],
    uncertainties: pick(row, 'uncertainties', 'unknowns', 'openQuestions') ?? [],
  }
}, z.object({
  supports: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(supportSchema)),
  contradictions: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(contradictionSchema),
  ),
  repetitions: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(repetitionSchema),
  ),
  gaps: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(gapSchema)),
  uncertainties: stringArraySchema,
}))

export type IdeaAnalysis = z.infer<typeof ideaAnalysisSchema>
