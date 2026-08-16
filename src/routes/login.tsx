import {
  createFileRoute,
  redirect,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { BtnBusy } from '#/components/ui/BtnBusy'
import { ThemeToggle } from '#/components/ui/ThemeToggle'
import { getSessionFn, loginFn } from '#/features/auth/auth.functions'

export const Route = createFileRoute('/login')({
  loader: async () => {
    const session = await getSessionFn()
    if (session.ok && session.data.user) {
      throw redirect({ to: '/', search: { assignTo: undefined } })
    }
    return null
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const login = useServerFn(loginFn)
  const hydrated = useHydrated()
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
      await navigate({ to: '/', search: { assignTo: undefined } })
    } catch {
      setError('登录失败，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mb-8">
        <div className="brand-mark" aria-hidden>
          章
        </div>
        <h1 className="page-title mt-5">成章</h1>
        <p className="page-desc">让闪现的想法自然长成文章。</p>
      </div>

      <form method="post" onSubmit={onSubmit} className="panel space-y-4">
        <div>
          <p className="section-kicker">Alpha · 单用户</p>
          <h2 className="section-title mt-1">登录</h2>
        </div>

        <label className="field">
          <span className="field-label">邮箱</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </label>
        {error ? (
          <p className="status status-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!hydrated || pending}
          aria-busy={pending}
          className="btn btn-primary w-full"
        >
          <BtnBusy busy={pending}>进入工作台</BtnBusy>
        </button>
      </form>

      <p className="meta mt-6 text-center">
        你的念头先落在纸上，成文的事稍后慢慢来。
      </p>
    </main>
  )
}
