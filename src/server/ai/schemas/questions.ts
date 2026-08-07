import { z } from 'zod'

export const ideaQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        targetGap: z.string().nullable(),
        whyItMatters: z.string().nullable(),
      }),
    )
    .max(3),
})

export type IdeaQuestionsOutput = z.infer<typeof ideaQuestionsSchema>
