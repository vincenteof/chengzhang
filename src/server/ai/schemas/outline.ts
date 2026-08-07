import { z } from 'zod'

import { asString, asStringArray, pick, stringArraySchema } from './zod-helpers'

const sectionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  return {
    id: asString(pick(row, 'id', 'sectionId'), `sec_${Math.random().toString(36).slice(2, 8)}`),
    title: asString(pick(row, 'title', 'name', 'heading')),
    purpose: asString(pick(row, 'purpose', 'goal', 'role', 'point')),
    fragmentIds: asStringArray(
      pick(row, 'fragmentIds', 'fragment_ids', 'fragments', 'materialIds') ?? [],
    ),
    missingMaterial: asStringArray(
      pick(row, 'missingMaterial', 'missing_material', 'missing', 'gaps') ?? [],
    ),
  }
}, z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string(),
  fragmentIds: stringArraySchema,
  missingMaterial: stringArraySchema,
}))

const optionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const sections = pick(row, 'sections', 'chapters', 'parts') ?? []
  return {
    id: asString(pick(row, 'id', 'optionId'), `out_${Math.random().toString(36).slice(2, 8)}`),
    title: asString(pick(row, 'title', 'name')),
    approach: asString(pick(row, 'approach', 'style', 'strategy')),
    narrativeLogic: asString(
      pick(row, 'narrativeLogic', 'narrative_logic', 'logic', 'flow', 'structure'),
    ),
    sections: Array.isArray(sections) ? sections : [],
    missingOverall: asStringArray(
      pick(row, 'missingOverall', 'missing_overall', 'missing', 'gaps') ?? [],
    ),
  }
}, z.object({
  id: z.string(),
  title: z.string(),
  approach: z.string(),
  narrativeLogic: z.string(),
  sections: z.array(sectionSchema),
  missingOverall: stringArraySchema,
}))

export const outlinesSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const options = pick(row, 'options', 'outlines', 'plans', 'candidates') ?? []
  return {
    options: Array.isArray(options) ? options.slice(0, 3) : [],
  }
}, z.object({
  // Allow 1–3 after model variance; UI still prefers 2+
  options: z.array(optionSchema).min(1).max(3),
}))

export type OutlinesOutput = z.infer<typeof outlinesSchema>
