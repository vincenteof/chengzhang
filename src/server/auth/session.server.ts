import { getRequestHeaders } from '@tanstack/react-start/server'

import { getAuth } from './auth'

export type SessionUser = {
  id: string
  email: string
  name: string
}

export async function getSession() {
  const auth = getAuth()
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  })
  return session
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getSession()
  const user = session?.user
  const email = user?.email
  if (!user || !email) {
    throw new Response('Unauthorized', { status: 401 })
  }

  const allowed = process.env.AUTH_ALLOWED_EMAIL?.trim().toLowerCase()
  if (allowed && email.toLowerCase() !== allowed) {
    throw new Response('Forbidden', { status: 403 })
  }

  return {
    id: user.id,
    email,
    name: user.name || email,
  }
}
