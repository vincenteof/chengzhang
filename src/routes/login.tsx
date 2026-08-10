import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { ThemeToggle } from '#/components/ui/ThemeToggle'
import { getSessionFn } from '#/features/auth/auth.functions'
import { authClient } from '#/lib/auth-client'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      // Browser hits /api/auth/* so Set-Cookie is applied natively.
      // Do NOT follow up with createServerFn session checks here: on Cloudflare
      // Workers those RPCs intermittently throw Error 1101 even when the
      // session cookie is already valid (see production probes).
      const { error: signInError } = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      })

      if (signInError) {
        const msg = signInError.message || ''
        if (/invalid|password|email|凭证|密码/i.test(msg)) {
          setError('邮箱或密码不正确')
        } else {
          setError(msg || '登录失败，请稍后重试')
        }
        return
      }

      // Full document navigation: SSR reads the new cookie without client RPC.
      window.location.assign('/')
    } catch (err) {
      console.error('[login]', err)
      setError('登录失败，请稍后重试')
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

      <form onSubmit={onSubmit} className="panel space-y-4">
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
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? '登录中…' : '进入工作台'}
        </button>
        <p className="meta text-center">
          线上账号见部署配置中的 AUTH_ALLOWED_EMAIL（常见为 author@chengzhang.prod）
        </p>
      </form>

      <p className="meta mt-6 text-center">
        你的念头先落在纸上，成文的事稍后慢慢来。
      </p>
    </main>
  )
}
