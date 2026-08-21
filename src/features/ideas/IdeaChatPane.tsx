import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { BtnBusy } from '#/components/ui/BtnBusy'
import { IconSend, IconSpinner } from '#/components/ui/icons'
import type { IdeaChatMessage } from '#/modules/ideas/idea-chat.service'
import type { FragmentRecord } from '#/modules/fragments/fragments.service'

export function IdeaChatPane({
  ideaId,
  ideaName,
  fragments,
  initialMessages,
  composing = false,
  onCompose,
}: {
  ideaId: string
  ideaName: string
  fragments: FragmentRecord[]
  initialMessages: IdeaChatMessage[]
  composing?: boolean
  onCompose?: () => void
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages, ideaId])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  async function send() {
    const content = draft.trim()
    if (!content || busy) return
    setBusy(true)
    setError(null)
    setDraft('')
    const pendingId = `pending-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      },
    ])
    try {
      const response = await fetch(`/api/ideas/${ideaId}/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!response.ok || !response.body) {
        throw new Error(
          response.status === 401 ? '请先登录' : '对话失败，请稍后重试',
        )
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantAcc = ''
      let assistantId: string | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as
            | { type: 'user'; message: IdeaChatMessage }
            | { type: 'delta'; text: string }
            | { type: 'done'; message: IdeaChatMessage }
            | { type: 'error'; message: string }
          if (event.type === 'user') {
            setMessages((prev) =>
              prev.map((m) => (m.id === pendingId ? event.message : m)),
            )
          } else if (event.type === 'delta') {
            assistantAcc += event.text
            if (!assistantId) {
              assistantId = `stream-${Date.now()}`
              const id = assistantId
              const text = assistantAcc
              setMessages((prev) => [
                ...prev,
                {
                  id,
                  role: 'assistant',
                  content: text,
                  createdAt: new Date().toISOString(),
                },
              ])
            } else {
              const id = assistantId
              const text = assistantAcc
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, content: text } : m)),
              )
            }
          } else if (event.type === 'done') {
            const streamId = assistantId
            setMessages((prev) => {
              if (streamId) {
                return prev.map((m) => (m.id === streamId ? event.message : m))
              }
              return [...prev, event.message]
            })
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '对话失败')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="idea-chat">
      <div className="idea-chat-scroll" ref={scroller}>
        <div className="idea-chat-column">
          <div className="idea-chat-intro">
            <h1 className="idea-chat-kicker">{ideaName}</h1>
            {fragments.length > 0 ? (
              <p className="idea-chat-lede">
                {fragments.length} 条碎片已在对话里。把最想说的那句谈清楚就好。
              </p>
            ) : (
              <p className="idea-chat-lede idea-chat-lede-warn">
                还没有碎片。先在下方补几条，再来谈。
              </p>
            )}
          </div>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`idea-chat-turn idea-chat-turn-${m.role}`}
            >
              {m.role === 'assistant' ? (
                <p className="idea-chat-who">成章</p>
              ) : null}
              <p className="idea-chat-text">{m.content}</p>
            </div>
          ))}
          {busy && messages[messages.length - 1]?.role === 'user' ? (
            <p className="idea-chat-wait">
              <IconSpinner size={14} />
              在听
            </p>
          ) : null}
        </div>
      </div>
      <div className="idea-chat-dock">
        {error ? <p className="idea-chat-error">{error}</p> : null}
        <form
          className="idea-chat-composer"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label className="sr-only" htmlFor="idea-chat-input">
            和成章谈「{ideaName}」
          </label>
          <textarea
            id="idea-chat-input"
            ref={inputRef}
            className="idea-chat-input"
            rows={2}
            value={draft}
            disabled={busy}
            placeholder="继续聊…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void send()
              }
            }}
          />
          <button
            type="submit"
            className="idea-chat-send"
            disabled={busy || !draft.trim()}
            aria-busy={busy}
            aria-label="发送"
            title="⌘ Enter 发送"
          >
            {busy ? <IconSpinner size={15} /> : <IconSend size={15} />}
          </button>
        </form>
        <div className="idea-chat-tools">
          <Link
            to="/"
            search={{ assignTo: ideaId }}
            className="idea-chat-tool-link"
          >
            {fragments.length === 0
              ? '先补几条碎片'
              : `${fragments.length} 条碎片 · 再记一条`}
          </Link>
          {onCompose ? (
            <button
              type="button"
              className="idea-chat-tool-action"
              disabled={composing || fragments.length === 0}
              aria-busy={composing}
              onClick={onCompose}
            >
              <BtnBusy busy={composing}>写一版</BtnBusy>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
