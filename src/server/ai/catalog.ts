export const AI_VENDORS = ['openai', 'xai', 'deepseek'] as const

export type AiVendor = (typeof AI_VENDORS)[number]

export type AiModelOption = {
  id: string
  label: string
}

export type AiVendorSpec = {
  id: AiVendor
  label: string
  baseURL?: string
  models: AiModelOption[]
  defaultModel: string
}

export const AI_VENDOR_SPECS: Record<AiVendor, AiVendorSpec> = {
  openai: {
    id: 'openai',
    label: 'GPT',
    models: [
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'gpt-4.1', label: 'gpt-4.1' },
      { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
    ],
    defaultModel: 'gpt-4o',
  },
  xai: {
    id: 'xai',
    label: 'Grok',
    baseURL: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-4', label: 'grok-4' },
      { id: 'grok-3', label: 'grok-3' },
      { id: 'grok-3-mini', label: 'grok-3-mini' },
    ],
    defaultModel: 'grok-4',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-chat', label: 'deepseek-chat' },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner' },
    ],
    defaultModel: 'deepseek-chat',
  },
}

export function isAiVendor(value: string): value is AiVendor {
  return (AI_VENDORS as readonly string[]).includes(value)
}

export function modelsForVendor(vendor: AiVendor): AiModelOption[] {
  return AI_VENDOR_SPECS[vendor].models
}

export function isVendorModel(vendor: AiVendor, modelId: string): boolean {
  return AI_VENDOR_SPECS[vendor].models.some((model) => model.id === modelId)
}

export function fallbackModel(vendor: AiVendor): string {
  return AI_VENDOR_SPECS[vendor].defaultModel
}
