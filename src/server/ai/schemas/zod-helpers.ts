import { z } from 'zod'

export function asString(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', '是'].includes(v)) return true
    if (['false', '0', 'no', 'n', '否'].includes(v)) return false
  }
  return fallback
}

export function asStringArray(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>
          return asString(row.id ?? row.fragmentId ?? row.text ?? row.value)
        }
        return asString(item)
      })
      .filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export const stringArraySchema = z.preprocess(
  (value) => asStringArray(value),
  z.array(z.string()),
)

export function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key]
  }
  return undefined
}
