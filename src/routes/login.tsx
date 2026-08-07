import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { getSessionFn, loginFn } from '#/features/auth/auth.functions'

export const Route = createFileRoute('/login')({
  loader: async () => {
    const session = await getSessionFn()
    if (session.ok && session.data.user) {
      throw redirect({ to: '/' })
    }
    return null
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const login = useServerFn(loginFn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await login({ data: { email, password } })
      if (!result.ok) {
        if (result.error.code === 'RATE_LIMITED') {
          const ms = Number(result.error.details?.retryAfterMs ?? 0)
          const sec = Math.ceil(ms / 1000)
          setError(`登录过于频繁，请约 ${sec || 60} 秒后重试`)
        } else {
          setError(result.error.message)
        }
        return
      }
      await navigate({ to: '/' })
    } catch {
      setError('登录失败，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">成章</h1>
      <p className="mt-2 text-sm text-neutral-600">单用户登录 · Alpha</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-700">邮箱</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-700">密码</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? '登录中…' : '登录'}
        </button>
      </form>
    </main>
  )
}
