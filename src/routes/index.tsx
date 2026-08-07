import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'

export const Route = createFileRoute('/')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    return { user: session.data.user }
  },
  component: HomePage,
})

function HomePage() {
  const { user } = Route.useLoaderData()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">成章 · Capture</h1>
          <p className="text-sm text-neutral-600">
            已登录为 {user.name}（{user.email}）
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          onClick={async () => {
            await logout()
            await navigate({ to: '/login' })
          }}
        >
          退出
        </button>
      </header>

      <section className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <h2 className="font-medium">Slice 0 状态</h2>
        <p className="mt-2 text-sm text-neutral-700">
          框架、会话与数据库骨架已就绪。捕捉 / Idea / Draft 业务闭环在 Slice 1 实现。
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          <li>
            <Link to="/probe/editor" className="text-blue-700 underline">
              Markdown 编辑器探针
            </Link>
          </li>
          <li>
            <Link to="/probe/ai" className="text-blue-700 underline">
              AI 结构化与流式取消探针
            </Link>
          </li>
          <li>
            <a href="/exports/drafts/probe" className="text-blue-700 underline">
              Markdown 导出探针
            </a>
          </li>
        </ul>
      </section>

      <section className="mt-6">
        <label className="block text-sm font-medium text-neutral-800">
          快速输入（占位，Slice 1 接持久化）
        </label>
        <textarea
          className="mt-2 min-h-28 w-full rounded border border-neutral-300 p-3 text-base"
          placeholder="记下不想失去的念头…"
          disabled
        />
        <p className="mt-1 text-xs text-neutral-500">提交快捷键与 localStorage 恢复将在 Slice 1 接通。</p>
      </section>
    </main>
  )
}
