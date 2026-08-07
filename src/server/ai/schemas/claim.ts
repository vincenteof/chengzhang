import { z } from 'zod'

export const candidateClaimsSchema = z.object({
  canFormClaim: z.boolean(),
  insufficiencyReason: z.string().nullable(),
  candidates: z
    .array(
      z.object({
        id: z.string(),
        claim: z.string(),
        rationale: z.string(),
        evidence: z.array(
          z.object({
            fragmentId: z.string(),
            reason: z.string(),
          }),
        ),
        tensions: z.array(z.string()),
        uncertainties: z.array(z.string()),
      }),
    )
    .max(3),
})

export type CandidateClaims = z.infer<typeof candidateClaimsSchema>
