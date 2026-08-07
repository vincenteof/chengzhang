import { z } from 'zod'

export const ideaAnalysisSchema = z.object({
  supports: z.array(
    z.object({
      fragmentId: z.string(),
      howItSupports: z.string(),
    }),
  ),
  contradictions: z.array(
    z.object({
      fragmentIds: z.array(z.string()).min(1),
      description: z.string(),
      isProductiveTension: z.boolean(),
    }),
  ),
  repetitions: z.array(
    z.object({
      fragmentIds: z.array(z.string()).min(1),
      description: z.string(),
    }),
  ),
  gaps: z.array(
    z.object({
      kind: z.enum(['argument', 'example', 'experience', 'explanation', 'other']),
      description: z.string(),
      whyItMatters: z.string(),
    }),
  ),
  uncertainties: z.array(z.string()),
})

export type IdeaAnalysis = z.infer<typeof ideaAnalysisSchema>
