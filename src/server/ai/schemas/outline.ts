import { z } from 'zod'

export const outlinesSchema = z.object({
  options: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        approach: z.string(),
        narrativeLogic: z.string(),
        sections: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            purpose: z.string(),
            fragmentIds: z.array(z.string()),
            missingMaterial: z.array(z.string()),
          }),
        ),
        missingOverall: z.array(z.string()),
      }),
    )
    .min(2)
    .max(3),
})

export type OutlinesOutput = z.infer<typeof outlinesSchema>
