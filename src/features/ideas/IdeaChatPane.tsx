import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { MarkdownPreview } from '#/components/editor/MarkdownPreview'
import { BtnBusy } from '#/components/ui/BtnBusy'
import {
  IconAiProcessing,
  IconPlus,
  IconSend,
  IconStop,
} from '#/components/ui/icons'
import { createFragmentFn } from '#/features/fragments/fragments.functions'
import { removeIdeaFragmentFn } from '#/features/ideas/ideas.functions'
import type { IdeaChatMessage } from '#/modules/ideas/idea-chat.service'
import type { FragmentRecord } from '#/modules/fragments/fragments.service'
import { createId } from '#/shared/ids'

import type { ChatFragPeek } from './ChatFragmentChip'
import {
  ChatFragPeekContext,
  ChatFragTurnContext,
  ChatFragmentOriginal,
} from './ChatFragmentChip'
import { ideaChatMarkdownComponents } from './idea-chat-markdown'

function FragmentQuote({
  content,
  busy = false,
  onRemove,
}: {
  content: string
  busy?: boolean
  onRemove?: () => void
}) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)

  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || open) {
      setClamped(false)
      return
    }
    function measure() {
      const node = textRef.current
      if (!node) return
      setClamped(node.scrollHeight > node.clientHeight + 2)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [content, open])

  return (
    <li className="idea-chat-source">
      <p
        ref={textRef}
        className={
          open ? 'idea-chat-source-text' : 'idea-chat-source-text is-clamped'
        }
      >
        {content}
      </p>
      {onRemove ? (
        <button
          type="button"
          className="idea-chat-source-remove"
          disabled={busy}
          aria-busy={busy}
          title="从这篇移出，碎片会留在捕捉里"
          onClick={onRemove}
        >
          {busy ? '移出中' : '移出'}
        </button>
      ) : null}
      {!open && clamped ? (
        <button
          type="button"
          className="idea-chat-source-more"
          onClick={() => setOpen(true)}
        >
          展开
        </button>
      ) : null}
    </li>
  )
}

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
  const router = useRouter()
  const createFragment = useServerFn(createFragmentFn)
  const removeFragment = useServerFn(removeIdeaFragmentFn)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localFragments, setLocalFragments] = useState(fragments)
  const [capturing, setCapturing] = useState(() => fragments.length === 0)
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(
    () => fragments.length > 0 && initialMessages.length === 0,
  )
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const attachRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const [peek, setPeek] = useState<ChatFragPeek | null>(null)
  const fragmentsById = useMemo(
    () => new Map(localFragments.map((fragment) => [fragment.id, fragment])),
    [localFragments],
  )
  const mdComponents = useMemo(
    () => ideaChatMarkdownComponents(localFragments),
    [localFragments],
  )
  const peekApi = useMemo(
    () => ({
      open: peek,
      toggle: (messageId: string, fragmentId: string) => {
        setPeek((current) =>
          current?.messageId === messageId && current.fragmentId === fragmentId
            ? null
            : { messageId, fragmentId },
        )
      },
    }),
    [peek],
  )

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages, ideaId])

  useEffect(() => {
    setPeek(null)
    setNote('')
    setNoteError(null)
    setCapturing(fragments.length === 0)
    setAttachOpen(false)
    setSourcesOpen(fragments.length > 0 && initialMessages.length === 0)
  }, [ideaId])

  useEffect(() => {
    setLocalFragments(fragments)
  }, [fragments])

  useEffect(() => {
    if (!peek) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPeek(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [peek])

  useEffect(() => {
    if (!attachOpen) return
    function onPointer(e: PointerEvent) {
      if (attachRef.current?.contains(e.target as Node)) return
      setAttachOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [attachOpen])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [ideaId])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    const resize = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
      const scrollEl = scroller.current
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draft, note, capturing])

  useEffect(() => {
    if (capturing) inputRef.current?.focus()
  }, [capturing])

  function stop() {
    abortRef.current?.abort()
  }

  async function saveNote() {
    const content = note.trim()
    if (!content || noteSaving) return
    setNoteSaving(true)
    setNoteError(null)
    try {
      const result = await createFragment({
        data: {
          content,
          captureRequestId: createId('cap'),
          ideaId,
        },
      })
      if (!result.ok) {
        setNoteError(result.error.message)
        return
      }
      setNote('')
      setLocalFragments((prev) =>
        prev.some((fragment) => fragment.id === result.data.id)
          ? prev
          : [...prev, result.data],
      )
      setSourcesOpen(true)
      await router.invalidate()
    } catch {
      setNoteError('保存失败，请稍后重试')
    } finally {
      setNoteSaving(false)
      inputRef.current?.focus()
    }
  }

  async function unlinkFragment(fragmentId: string) {
    if (removingId) return
    setRemovingId(fragmentId)
    setError(null)
    try {
      const result = await removeFragment({
        data: { ideaId, fragmentId },
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setLocalFragments((prev) =>
        prev.filter((fragment) => fragment.id !== fragmentId),
      )
      setPeek((current) =>
        current?.fragmentId === fragmentId ? null : current,
      )
      await router.invalidate()
    } catch {
      setError('移出失败，请稍后重试')
    } finally {
      setRemovingId(null)
    }
  }

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
    const abort = new AbortController()
    abortRef.current = abort
    try {
      const response = await fetch(`/api/ideas/${ideaId}/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: abort.signal,
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
          let event:
            | { type: 'user'; message: IdeaChatMessage }
            | { type: 'delta'; text: string }
            | { type: 'done'; message: IdeaChatMessage }
            | { type: 'error'; message: string }
          try {
            event = JSON.parse(line) as typeof event
          } catch {
            if (abort.signal.aborted) return
            throw new Error('对话失败，请稍后重试')
          }
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
            if (event.message === '已取消' || abort.signal.aborted) return
            throw new Error(event.message)
          }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) return
      setError(err instanceof Error ? err.message : '对话失败')
    } finally {
      if (abortRef.current === abort) abortRef.current = null
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
            {localFragments.length === 0 ? (
              <p className="idea-chat-lede idea-chat-lede-warn">
                还没有碎片。点 +，记到这篇。
              </p>
            ) : (
              <div className="idea-chat-sources">
                <button
                  type="button"
                  className="idea-chat-sources-toggle"
                  aria-expanded={sourcesOpen}
                  onClick={() => setSourcesOpen((open) => !open)}
                >
                  {localFragments.length} 条碎片
                </button>
                {sourcesOpen ? (
                  <ul className="idea-chat-source-list">
                    {localFragments.map((fragment) => (
                      <FragmentQuote
                        key={fragment.id}
                        content={fragment.content}
                        busy={removingId === fragment.id}
                        onRemove={() => void unlinkFragment(fragment.id)}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
          <ChatFragPeekContext.Provider value={peekApi}>
            {messages.map((m) => (
              <ChatFragTurnContext.Provider key={m.id} value={m.id}>
                <div className={`idea-chat-turn idea-chat-turn-${m.role}`}>
                  {m.role === 'assistant' ? (
                    <p className="idea-chat-who">成章</p>
                  ) : null}
                  {m.role === 'assistant' ? (
                    <>
                      <MarkdownPreview
                        content={m.content}
                        className="idea-chat-md prose-cz"
                        components={mdComponents}
                      />
                      {peek?.messageId === m.id ? (
                        <ChatFragmentOriginal
                          fragment={fragmentsById.get(peek.fragmentId)}
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="idea-chat-text">{m.content}</p>
                  )}
                </div>
              </ChatFragTurnContext.Provider>
            ))}
          </ChatFragPeekContext.Provider>
          {busy && messages[messages.length - 1]?.role === 'user' ? (
            <div className="idea-chat-turn idea-chat-turn-assistant">
              <p className="idea-chat-who">成章</p>
              <p className="idea-chat-wait" aria-live="polite">
                <IconAiProcessing />
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="idea-chat-dock">
        {error ? <p className="idea-chat-error">{error}</p> : null}
        {noteError ? <p className="idea-chat-error">{noteError}</p> : null}
        <form
          className={`idea-chat-composer${capturing ? ' is-note' : ''}`}
          onSubmit={(e) => {
            e.preventDefault()
            if (capturing) {
              void saveNote()
              return
            }
            void send()
          }}
        >
          <div className="idea-chat-attach" ref={attachRef}>
            <button
              type="button"
              className="idea-chat-attach-btn"
              aria-label="添加"
              aria-haspopup="menu"
              aria-expanded={attachOpen}
              onClick={() => setAttachOpen((open) => !open)}
            >
              <IconPlus size={16} />
            </button>
            {attachOpen ? (
              <div className="idea-chat-attach-menu" role="menu">
                {capturing ? (
                  <button
                    type="button"
                    className="idea-chat-attach-item"
                    role="menuitem"
                    onClick={() => {
                      setCapturing(false)
                      setAttachOpen(false)
                    }}
                  >
                    继续聊
                  </button>
                ) : (
                  <button
                    type="button"
                    className="idea-chat-attach-item"
                    role="menuitem"
                    onClick={() => {
                      setCapturing(true)
                      setAttachOpen(false)
                    }}
                  >
                    记到这篇
                  </button>
                )}
                <Link
                  to="/"
                  search={{ assignTo: ideaId }}
                  className="idea-chat-attach-item"
                  role="menuitem"
                  onClick={() => setAttachOpen(false)}
                >
                  从碎片里挑
                </Link>
              </div>
            ) : null}
          </div>
          {capturing ? (
            <span className="idea-chat-note-chip">记到这篇</span>
          ) : null}
          <label className="sr-only" htmlFor="idea-chat-input">
            {capturing
              ? `记一条碎片到「${ideaName}」`
              : `和成章谈「${ideaName}」`}
          </label>
          <textarea
            id="idea-chat-input"
            ref={inputRef}
            className="idea-chat-input"
            rows={1}
            value={capturing ? note : draft}
            placeholder={
              capturing ? '一段判断、一个比喻、一个例子…' : '继续聊…'
            }
            onChange={(e) => {
              if (capturing) setNote(e.target.value)
              else setDraft(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (capturing) {
                  e.preventDefault()
                  setCapturing(false)
                }
                return
              }
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault()
                if (capturing) {
                  void saveNote()
                  return
                }
                if (busy) return
                void send()
              }
            }}
          />
          {capturing ? (
            <button
              type="submit"
              className="idea-chat-note-save"
              disabled={noteSaving || !note.trim()}
              aria-busy={noteSaving}
            >
              <BtnBusy busy={noteSaving}>记下</BtnBusy>
            </button>
          ) : busy ? (
            <button
              type="button"
              className="idea-chat-send"
              aria-label="停止"
              onClick={stop}
            >
              <IconStop size={15} />
            </button>
          ) : (
            <button
              type="submit"
              className="idea-chat-send"
              disabled={!draft.trim()}
              aria-label="发送"
            >
              <IconSend size={15} />
            </button>
          )}
        </form>
        {onCompose ? (
          <div className="idea-chat-tools">
            <button
              type="button"
              className="idea-chat-tool-action"
              disabled={composing || localFragments.length === 0}
              aria-busy={composing}
              onClick={onCompose}
            >
              <BtnBusy busy={composing}>写一版</BtnBusy>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
