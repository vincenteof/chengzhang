import { z } from 'zod'

import { asString, pick } from './zod-helpers'

const questionItemSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return {
      question: value,
      targetGap: null,
      whyItMatters: null,
    }
  }
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const target = pick(row, 'targetGap', 'target_gap', 'gap', 'focus')
  const why = pick(row, 'whyItMatters', 'why_it_matters', 'why', 'reason')
  return {
    question: asString(pick(row, 'question', 'text', 'q', 'prompt')),
    targetGap: target == null || target === '' ? null : asString(target),
    whyItMatters: why == null || why === '' ? null : asString(why),
  }
}, z.object({
  question: z.string(),
  targetGap: z.string().nullable(),
  whyItMatters: z.string().nullable(),
}))

export const ideaQuestionsSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const list = pick(row, 'questions', 'items', 'qs') ?? []
  return {
    questions: Array.isArray(list) ? list.slice(0, 3) : [],
  }
}, z.object({
  questions: z.array(questionItemSchema).max(3),
}))

export type IdeaQuestionsOutput = z.infer<typeof ideaQuestionsSchema>
