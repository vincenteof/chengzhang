import { z } from 'zod'

const stringArray = z.preprocess((value) => {
  if (value == null) return []
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value ? [value] : []
  return []
}, z.array(z.string()))

const evidenceSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (!item || typeof item !== 'object') return item
    const row = item as Record<string, unknown>
    return {
      fragmentId: String(
        row.fragmentId ?? row.fragment_id ?? row.id ?? '',
      ),
      reason: String(row.reason ?? row.why ?? row.explanation ?? ''),
    }
  })
}, z.array(
  z.object({
    fragmentId: z.string(),
    reason: z.string(),
  }),
))

const candidateSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  return {
    id: String(row.id ?? row.candidateId ?? cryptoRandomId()),
    claim: String(row.claim ?? row.text ?? row.statement ?? ''),
    rationale: String(row.rationale ?? row.reason ?? row.explanation ?? ''),
    evidence: row.evidence ?? [],
    tensions: row.tensions ?? row.conflicts ?? [],
    uncertainties: row.uncertainties ?? row.unknowns ?? [],
  }
}, z.object({
  id: z.string(),
  claim: z.string(),
  rationale: z.string(),
  evidence: evidenceSchema,
  tensions: stringArray,
  uncertainties: stringArray,
}))

export const candidateClaimsSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const row = value as Record<string, unknown>
  const canRaw = row.canFormClaim ?? row.can_form_claim ?? row.enough
  let canFormClaim = Boolean(canRaw)
  if (typeof canRaw === 'string') {
    canFormClaim = !['false', '0', 'no', '否'].includes(canRaw.toLowerCase())
  }
  const candidates = row.candidates ?? row.items ?? row.claims ?? []
  return {
    canFormClaim,
    insufficiencyReason:
      row.insufficiencyReason == null && row.insufficiency_reason == null
        ? null
        : String(row.insufficiencyReason ?? row.insufficiency_reason ?? ''),
    candidates: Array.isArray(candidates) ? candidates.slice(0, 3) : [],
  }
}, z.object({
  canFormClaim: z.boolean(),
  insufficiencyReason: z.string().nullable(),
  candidates: z.array(candidateSchema).max(3),
}))

export type CandidateClaims = z.infer<typeof candidateClaimsSchema>

function cryptoRandomId() {
  return `cand_${Math.random().toString(36).slice(2, 10)}`
}
