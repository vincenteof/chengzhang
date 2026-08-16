import { eq } from 'drizzle-orm'

import {
  AI_VENDOR_SPECS,
  fallbackModel,
  isAiVendor,
  isVendorModel,
} from '#/server/ai/catalog'
import type { AiVendor } from '#/server/ai/catalog'
import {
  decryptSecret,
  encryptSecret,
  secretLast4,
} from '#/server/ai/settings-crypto.server'
import type { Db } from '#/server/db/client.server'
import { appSettings } from '#/server/db/schema'

export const SETTINGS_ROW_ID = 'default'

export type AiRuntimeSource = 'settings' | 'env' | 'none'

export type AiSettingsPublic = {
  vendor: AiVendor
  hasKey: boolean
  keyLast4: string | null
  model: string
  runtimeSource: AiRuntimeSource
  runtimeVendor: AiVendor | 'mock'
}

export type AiSettingsResolved = {
  vendor: AiVendor
  apiKey: string
  baseURL?: string
  model: string
  source: 'settings' | 'env'
}

function envOpenAiAvailable(): boolean {
  return (
    (process.env.AI_PROVIDER || '').toLowerCase().trim() === 'openai' &&
    Boolean(process.env.OPENAI_API_KEY?.trim())
  )
}

function runtimeHint(hasSettingsKey: boolean): {
  runtimeSource: AiRuntimeSource
  runtimeVendor: AiVendor | 'mock'
} {
  if (hasSettingsKey) {
    return { runtimeSource: 'settings', runtimeVendor: 'openai' }
  }
  if (envOpenAiAvailable()) {
    return { runtimeSource: 'env', runtimeVendor: 'openai' }
  }
  return { runtimeSource: 'none', runtimeVendor: 'mock' }
}

const emptyPublic = (): AiSettingsPublic => {
  const hint = runtimeHint(false)
  return {
    vendor: 'openai',
    hasKey: false,
    keyLast4: null,
    model: fallbackModel('openai'),
    ...hint,
  }
}

export async function getAiSettingsPublic(db: Db): Promise<AiSettingsPublic> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  const row = rows[0]
  if (!row || !isAiVendor(row.vendor)) return emptyPublic()
  const hasKey = Boolean(row.apiKeyCipher)
  const hint = runtimeHint(hasKey)
  return {
    vendor: row.vendor,
    hasKey,
    keyLast4: row.apiKeyLast4,
    model: row.modelDraft,
    runtimeSource: hint.runtimeSource,
    runtimeVendor: hasKey ? row.vendor : hint.runtimeVendor,
  }
}

export async function saveAiSettings(
  db: Db,
  input: {
    vendor: AiVendor
    apiKey?: string | null
    model: string
    clearKey?: boolean
  },
): Promise<AiSettingsPublic> {
  if (!isVendorModel(input.vendor, input.model)) {
    throw Object.assign(new Error('所选模型不属于当前厂商'), {
      code: 'VALIDATION_ERROR',
    })
  }

  const spec = AI_VENDOR_SPECS[input.vendor]
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ROW_ID))
    .limit(1)

  let cipher = existing[0]?.apiKeyCipher ?? null
  let last4 = existing[0]?.apiKeyLast4 ?? null

  if (input.clearKey) {
    cipher = null
    last4 = null
  } else if (input.apiKey?.trim()) {
    const plain = input.apiKey.trim()
    cipher = await encryptSecret(plain)
    last4 = secretLast4(plain)
  }

  const now = new Date()
  const values = {
    id: SETTINGS_ROW_ID,
    vendor: input.vendor,
    apiKeyCipher: cipher,
    apiKeyLast4: last4,
    modelDraft: input.model || spec.defaultModel,
    modelFast: input.model || spec.defaultModel,
    updatedAt: now,
  }

  if (existing[0]) {
    await db
      .update(appSettings)
      .set(values)
      .where(eq(appSettings.id, SETTINGS_ROW_ID))
  } else {
    await db.insert(appSettings).values(values)
  }

  return getAiSettingsPublic(db)
}

export async function resolveAiSettings(
  db: Db,
): Promise<AiSettingsResolved | null> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  const row = rows[0]
  if (row && isAiVendor(row.vendor) && row.apiKeyCipher) {
    const spec = AI_VENDOR_SPECS[row.vendor]
    return {
      vendor: row.vendor,
      apiKey: await decryptSecret(row.apiKeyCipher),
      baseURL: spec.baseURL,
      model: row.modelDraft,
      source: 'settings',
    }
  }

  const envKey = process.env.OPENAI_API_KEY?.trim()
  const envProvider = (process.env.AI_PROVIDER || '').toLowerCase().trim()
  if (envProvider === 'openai' && envKey) {
    return {
      vendor: 'openai',
      apiKey: envKey,
      model:
        process.env.AI_MODEL_PRIMARY || AI_VENDOR_SPECS.openai.defaultModel,
      source: 'env',
    }
  }

  return null
}
