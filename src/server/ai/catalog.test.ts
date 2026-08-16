import { describe, expect, it } from 'vitest'

import {
  AI_VENDORS,
  AI_VENDOR_SPECS,
  fallbackModels,
  isAiVendor,
  isVendorModel,
} from './catalog'

describe('ai catalog', () => {
  it('only lists gpt, grok, and deepseek', () => {
    expect([...AI_VENDORS]).toEqual(['openai', 'xai', 'deepseek'])
    expect(AI_VENDOR_SPECS.openai.label).toBe('GPT')
    expect(AI_VENDOR_SPECS.xai.label).toBe('Grok')
    expect(AI_VENDOR_SPECS.deepseek.label).toBe('DeepSeek')
  })

  it('rejects unknown vendors and cross-vendor models', () => {
    expect(isAiVendor('openai')).toBe(true)
    expect(isAiVendor('anthropic')).toBe(false)
    expect(isVendorModel('openai', 'gpt-4o')).toBe(true)
    expect(isVendorModel('openai', 'grok-4')).toBe(false)
    expect(isVendorModel('deepseek', 'deepseek-chat')).toBe(true)
  })

  it('keeps vendor defaults inside the vendor list', () => {
    for (const vendor of AI_VENDORS) {
      const defaults = fallbackModels(vendor)
      expect(isVendorModel(vendor, defaults.modelDraft)).toBe(true)
      expect(isVendorModel(vendor, defaults.modelFast)).toBe(true)
    }
  })
})
