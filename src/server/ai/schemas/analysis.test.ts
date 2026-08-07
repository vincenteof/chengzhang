import { describe, expect, it } from 'vitest'

import { ideaAnalysisSchema } from './analysis'

describe('ideaAnalysisSchema', () => {
  it('accepts snake_case and partial shapes from models', () => {
    const parsed = ideaAnalysisSchema.safeParse({
      support: [{ fragment_id: 'frag_1', reason: 'supports claim' }],
      tensions: [
        {
          fragments: ['frag_1', 'frag_2'],
          summary: 'they conflict',
          productive: true,
        },
      ],
      repeats: [],
      missing: [{ type: 'experience', gap: 'need story', why: 'grounding' }],
      unknowns: ['tone'],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.supports[0]?.fragmentId).toBe('frag_1')
    expect(parsed.data.contradictions[0]?.isProductiveTension).toBe(true)
    expect(parsed.data.gaps[0]?.kind).toBe('experience')
    expect(parsed.data.uncertainties).toContain('tone')
  })
})
