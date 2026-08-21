import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef, useState } from 'react'

import { BtnBusy } from '#/components/ui/BtnBusy'
import { IdeaChatPane } from '#/features/ideas/IdeaChatPane'
import { IdeaWritePane } from '#/features/ideas/IdeaWritePane'
import {
  createDraftFn,
  getDraftFn,
  saveDraftFn,
} from '#/features/drafts/drafts.functions'
import { listIdeaMessagesFn } from '#/features/ideas/idea-chat.functions'
import { getIdeaWorkspaceFn } from '#/features/ideas/ideas.functions'

export const Route = createFileRoute('/ideas/$ideaId')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    mode?: 'chat' | 'write'
  } => ({
    mode:
      search.mode === 'write'
        ? 'write'
        : search.mode === 'chat'
          ? 'chat'
          : undefined,
  }),
  loader: async ({ params }) => {
    const workspace = await getIdeaWorkspaceFn({
      data: { ideaId: params.ideaId },
    })
    if (!workspace.ok) {
      throw redirect({ to: '/ideas' })
    }
    const messages = await listIdeaMessagesFn({
      data: { ideaId: params.ideaId },
    })
    return {
      workspace: workspace.data,
      messages: messages.ok ? messages.data : [],
    }
  },
  component: IdeaWorkspacePage,
})

function IdeaWorkspacePage() {
  const { workspace, messages } = Route.useLoaderData()
  const { mode: modeParam } = Route.useSearch()
  const mode = modeParam ?? 'chat'
  const { idea, fragments, draft } = workspace
  const navigate = useNavigate()
  const router = useRouter()
  const createDraft = useServerFn(createDraftFn)
  const getDraft = useServerFn(getDraftFn)
  const saveDraft = useServerFn(saveDraftFn)

  const [status, setStatus] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeConfirm, setComposeConfirm] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hasArticle = Boolean(draft?.content?.trim())

  async function setMode(next: 'chat' | 'write') {
    await navigate({
      to: '/ideas/$ideaId',
      params: { ideaId: idea.id },
      search: { mode: next },
      replace: true,
    })
  }

  async function ensureDraft() {
    if (draft) {
      const fresh = await getDraft({ data: { draftId: draft.id } })
      if (fresh.ok) return fresh.data
    }
    const result = await createDraft({
      data: { ideaId: idea.id, title: idea.name },
    })
    if (!result.ok) {
      setStatus(result.error.message)
      return null
    }
    return result.data
  }

  async function openBlankDraft() {
    const current = await ensureDraft()
    if (!current) return
    await navigate({
      to: '/drafts/$draftId',
      params: { draftId: current.id },
      search: { compose: false },
    })
  }

  async function streamCompose() {
    if (composing) return
    if (fragments.length === 0) {
      setStatus('请先加入至少一条碎片')
      return
    }
    setComposeConfirm(false)
    setComposing(true)
    setStatus('正在根据对话写文章…')
    const current = await ensureDraft()
    if (!current) {
      setComposing(false)
      return
    }
    const abort = new AbortController()
    abortRef.current = abort
    try {
      const response = await fetch(`/api/drafts/${current.id}/compose`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: idea.id }),
        signal: abort.signal,
      })
      if (!response.ok || !response.body) {
        if (response.status === 401) throw new Error('请先登录')
        if (response.status === 403) {
          throw new Error('请求被拦截，请用 APP_ORIGIN 里配置的地址打开')
        }
        throw new Error('生成失败，请稍后重试')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as
            | { type: 'delta'; text: string }
            | { type: 'done'; generationId: string; text: string }
            | { type: 'error'; message: string }
          if (event.type === 'delta') acc += event.text
          if (event.type === 'error') throw new Error(event.message)
        }
      }
      if (acc.trim()) {
        const saved = await saveDraft({
          data: {
            id: current.id,
            baseRevision: current.revision,
            title: idea.name,
            content: acc,
          },
        })
        if (!saved.ok) {
          setStatus(saved.error.message)
          return
        }
      }
      setStatus(acc.trim() ? '已写入正文' : '没有生成内容')
      await router.invalidate()
      await setMode('write')
    } catch (error) {
      if (abort.signal.aborted) {
        setStatus('已取消生成')
      } else {
        setStatus(
          `生成失败：${error instanceof Error ? error.message : '请重试'}`,
        )
      }
    } finally {
      abortRef.current = null
      setComposing(false)
    }
  }

  function requestCompose() {
    if (composing) return
    if (hasArticle) {
      setComposeConfirm(true)
      return
    }
    void streamCompose()
  }

  return (
    <div className="idea-stage">
      <div className="idea-stage-bar">
        <div className="idea-mode" role="tablist" aria-label="想法模式">
          <button
            type="button"
            className="idea-mode-item"
            role="tab"
            aria-selected={mode === 'chat'}
            onClick={() => void setMode('chat')}
          >
            对话
          </button>
          <button
            type="button"
            className="idea-mode-item"
            role="tab"
            aria-selected={mode === 'write'}
            onClick={() => void setMode('write')}
          >
            正文
          </button>
        </div>
      </div>

      {composeConfirm ? (
        <div className="idea-banner idea-banner-warn">
          <p>已有正文。再写一版会替换当前文章。</p>
          <div className="idea-banner-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void streamCompose()}
            >
              替换并生成
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setComposeConfirm(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {composing ? (
        <div className="idea-banner">
          <p>正在根据碎片和对话写入正文…</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => abortRef.current?.abort()}
          >
            停止
          </button>
        </div>
      ) : null}

      {status && !composing ? (
        <p
          className={`idea-status ${status.includes('失败') ? 'idea-status-error' : ''}`}
          role="status"
        >
          {status}
        </p>
      ) : null}

      <div className="idea-stage-body">
        {mode === 'chat' ? (
          <IdeaChatPane
            ideaId={idea.id}
            ideaName={idea.name}
            fragments={fragments}
            initialMessages={messages}
            composing={composing}
            onCompose={requestCompose}
          />
        ) : draft ? (
          <IdeaWritePane key={draft.id} draftId={draft.id} />
        ) : (
          <div className="ideas-empty">
            <p className="ideas-empty-title">还没有正文</p>
            <p className="ideas-empty-desc">
              先在对话里把方向聊清楚，再写一版。
            </p>
            <div className="ideas-empty-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={composing || fragments.length === 0}
                aria-busy={composing}
                onClick={() => requestCompose()}
              >
                <BtnBusy busy={composing}>写一版</BtnBusy>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void openBlankDraft()}
              >
                空白草稿
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
