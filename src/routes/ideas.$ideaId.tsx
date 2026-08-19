import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { AppShell } from '#/components/ui/AppShell'
import { BtnBusy } from '#/components/ui/BtnBusy'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import { createDraftFn } from '#/features/drafts/drafts.functions'
import { createFragmentFn } from '#/features/fragments/fragments.functions'
import {
  getIdeaWorkspaceFn,
  removeIdeaFragmentFn,
} from '#/features/ideas/ideas.functions'
import { createId } from '#/shared/ids'

export const Route = createFileRoute('/ideas/$ideaId')({
  loader: async ({ params }) => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const workspace = await getIdeaWorkspaceFn({
      data: { ideaId: params.ideaId },
    })
    if (!workspace.ok) {
      throw redirect({ to: '/ideas' })
    }
    return {
      user: session.data.user,
      workspace: workspace.data,
    }
  },
  component: IdeaWorkspacePage,
})

function IdeaWorkspacePage() {
  const { user, workspace } = Route.useLoaderData()
  const { idea, fragments, draft } = workspace
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const removeFragment = useServerFn(removeIdeaFragmentFn)
  const createFragment = useServerFn(createFragmentFn)
  const createDraft = useServerFn(createDraftFn)

  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [composeSaving, setComposeSaving] = useState(false)
  const canGenerate = fragments.length >= 1
  const hasArticle = Boolean(draft?.content?.trim())

  async function ensureDraft() {
    if (draft) return draft
    const result = await createDraft({
      data: { ideaId: idea.id, title: idea.name },
    })
    if (!result.ok) {
      setStatus(result.error.message)
      return null
    }
    await router.invalidate()
    return result.data
  }

  async function submitInlineFragment() {
    const content = composeText.trim()
    if (!content || composeSaving) return
    setComposeSaving(true)
    setStatus(null)
    try {
      const result = await createFragment({
        data: {
          content,
          captureRequestId: createId('cap'),
          ideaId: idea.id,
        },
      })
      if (!result.ok) {
        setStatus(result.error.message)
        return
      }
      setComposeText('')
      setComposeOpen(false)
      setStatus('已写入本想法')
      setComposeSaving(false)
      await router.invalidate()
    } catch {
      setStatus('保存失败，可重试')
    } finally {
      setComposeSaving(false)
    }
  }

  async function writeArticle() {
    if (busy) return
    if (!canGenerate) {
      setStatus('请先加入至少一条碎片')
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const current = await ensureDraft()
      if (!current) return
      await navigate({
        to: '/drafts/$draftId',
        params: { draftId: current.id },
        search: { compose: true },
      })
    } catch {
      setStatus('无法打开编辑器')
    } finally {
      setBusy(false)
    }
  }

  async function openEditor() {
    if (draft) {
      await navigate({
        to: '/drafts/$draftId',
        params: { draftId: draft.id },
        search: { compose: false },
      })
      return
    }
    const created = await createDraft({
      data: { ideaId: idea.id, title: idea.name },
    })
    if (!created.ok) {
      setStatus(created.error.message)
      return
    }
    await navigate({
      to: '/drafts/$draftId',
      params: { draftId: created.data.id },
      search: { compose: false },
    })
  }

  return (
    <AppShell
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="mb-5">
        <Link to="/ideas" className="cz-link text-sm">
          ← 想法
        </Link>
      </div>

      <p className="section-kicker">想法</p>
      <h1 className="page-title mt-1">{idea.name}</h1>
      {idea.description ? (
        <p className="muted mt-1 text-sm">{idea.description}</p>
      ) : null}
      <p className="muted mt-2 max-w-xl text-sm">
        归类素材，再写成文章。生成和改稿都在编辑器里完成。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="badge">{fragments.length} 条碎片</span>
        {draft?.content?.trim() ? (
          <span className="badge badge-moss">已有文章</span>
        ) : (
          <span className="badge">尚无正文</span>
        )}
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-kicker">素材</p>
            <h2 className="section-title mt-1">碎片</h2>
            <p className="meta mt-1">只显示已归入本想法的内容。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setComposeOpen((v) => !v)}
            >
              {composeOpen ? '收起' : '在本想法写一条'}
            </button>
            <Link
              to="/"
              search={{ assignTo: idea.id }}
              className="btn btn-secondary btn-sm"
            >
              去捕捉挑选
            </Link>
          </div>
        </div>

        {composeOpen ? (
          <div className="panel panel-muted mt-4 space-y-2 !p-3">
            <label className="sr-only" htmlFor="idea-inline-fragment">
              写入本想法
            </label>
            <textarea
              id="idea-inline-fragment"
              className="textarea text-sm"
              rows={3}
              autoFocus
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void submitInlineFragment()
                }
              }}
              placeholder="直接记进这个想法的一条判断、例子或原话…"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="meta">⌘/Ctrl + Enter 保存并归入本想法</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={composeSaving || !composeText.trim()}
                aria-busy={composeSaving}
                onClick={() => void submitInlineFragment()}
              >
                <BtnBusy busy={composeSaving}>保存到本想法</BtnBusy>
              </button>
            </div>
          </div>
        ) : null}

        <ul className="mt-4 space-y-2">
          {fragments.length === 0 ? (
            <li className="empty text-sm">
              还没有碎片。可「在本想法写一条」，或去捕捉勾选后加入本想法。
            </li>
          ) : (
            fragments.map((fragment) => (
              <li key={fragment.id} className="card text-sm">
                <p className="whitespace-pre-wrap">{fragment.content}</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs mt-2 text-[var(--cz-danger)]"
                  title="只解除与本想法的关联，不删除碎片本身"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        '从本想法移出这条碎片？碎片仍会留在捕捉里，不会删除。',
                      )
                    ) {
                      return
                    }
                    const result = await removeFragment({
                      data: { ideaId: idea.id, fragmentId: fragment.id },
                    })
                    if (!result.ok) {
                      setStatus(result.error.message)
                      return
                    }
                    setStatus('已从本想法移出')
                    await router.invalidate()
                  }}
                >
                  移出
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="panel mt-10">
        <p className="section-kicker">文章</p>
        <h2 className="section-title mt-1">成文</h2>
        <p className="meta mt-1">
          {hasArticle
            ? '文章在编辑器里。补完素材后也可在那里用碎片重写。'
            : '用当前想法下的碎片在编辑器里写成一篇文章。'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {hasArticle ? (
            <button
              type="button"
              disabled={busy}
              className="btn btn-primary"
              onClick={() => void openEditor()}
            >
              打开文章
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !canGenerate}
              className="btn btn-primary"
              onClick={() => void writeArticle()}
            >
              {busy ? '打开中…' : '写成文章'}
            </button>
          )}
          {!hasArticle ? (
            <button
              type="button"
              disabled={busy}
              className="btn btn-secondary"
              onClick={() => void openEditor()}
            >
              空白草稿
            </button>
          ) : null}
          {!canGenerate && !hasArticle ? (
            <span className="status-warn self-center text-xs">
              至少 1 条碎片
            </span>
          ) : null}
        </div>
      </section>

      {status ? (
        <p
          className={`status mt-6 ${status.includes('失败') ? 'status-error' : ''}`}
          role="status"
        >
          {status}
        </p>
      ) : null}
    </AppShell>
  )
}
