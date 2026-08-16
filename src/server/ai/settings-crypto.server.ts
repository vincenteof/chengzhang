const encoder = new TextEncoder()
const decoder = new TextDecoder()

function settingsSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET or SESSION_SECRET is required to store API keys',
    )
  }
  return secret
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await importAesKey(settingsSecret())
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plain),
  )
  return `${toB64(iv)}.${toB64(new Uint8Array(buf))}`
}

export async function decryptSecret(packed: string): Promise<string> {
  const [ivPart, dataPart] = packed.split('.')
  if (!ivPart || !dataPart) {
    throw new Error('Invalid encrypted secret')
  }
  const key = await importAesKey(settingsSecret())
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivPart) },
    key,
    fromB64(dataPart),
  )
  return decoder.decode(raw)
}

export function secretLast4(plain: string): string {
  const trimmed = plain.trim()
  return trimmed.slice(-4)
}
