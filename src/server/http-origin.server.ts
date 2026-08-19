function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Same app, or local loopback on another port (vite --port 3001, etc.). */
export function isAllowedBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  const appOrigin = process.env.APP_ORIGIN || process.env.BETTER_AUTH_URL
  if (!appOrigin) return true
  if (origin === appOrigin) return true

  const from = parseOrigin(origin)
  const expected = parseOrigin(appOrigin)
  if (
    from &&
    expected &&
    isLoopbackHost(from.hostname) &&
    isLoopbackHost(expected.hostname)
  ) {
    return true
  }

  return process.env.NODE_ENV !== 'production'
}
