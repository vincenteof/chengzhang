type Bucket = {
  failures: number
  windowStartedAt: number
}

const buckets = new Map<string, Bucket>()

function getConfig() {
  return {
    maxFailures: Number(process.env.AUTH_LOGIN_MAX_FAILURES ?? 5),
    windowMs: Number(process.env.AUTH_LOGIN_WINDOW_MS ?? 60_000),
  }
}

export function getLoginRateLimitKey(email: string, clientKey: string) {
  return `${email.trim().toLowerCase()}|${clientKey}`
}

export function checkLoginRateLimit(key: string): {
  allowed: boolean
  retryAfterMs: number
} {
  const { maxFailures, windowMs } = getConfig()
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket) {
    return { allowed: true, retryAfterMs: 0 }
  }

  if (now - bucket.windowStartedAt >= windowMs) {
    buckets.delete(key)
    return { allowed: true, retryAfterMs: 0 }
  }

  if (bucket.failures >= maxFailures) {
    return {
      allowed: false,
      retryAfterMs: windowMs - (now - bucket.windowStartedAt),
    }
  }

  return { allowed: true, retryAfterMs: 0 }
}

export function recordLoginFailure(key: string) {
  const { windowMs } = getConfig()
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStartedAt >= windowMs) {
    buckets.set(key, { failures: 1, windowStartedAt: now })
    return
  }

  bucket.failures += 1
  buckets.set(key, bucket)
}

export function clearLoginFailures(key: string) {
  buckets.delete(key)
}

/** Test helper */
export function __resetLoginRateLimitForTests() {
  buckets.clear()
}
