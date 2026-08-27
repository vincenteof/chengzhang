import { createContext, useContext } from 'react'

import type { FragmentRecord } from '#/modules/fragments/fragments.service'

import { fragmentSnippet } from './fragment-mentions'

export type ChatFragPeek = {
  messageId: string
  fragmentId: string
}

export const ChatFragPeekContext = createContext<{
  open: ChatFragPeek | null
  toggle: (messageId: string, fragmentId: string) => void
}>({ open: null, toggle: () => {} })

export const ChatFragTurnContext = createContext<string | null>(null)

export function ChatFragmentChip({
  id,
  fragment,
  index,
}: {
  id: string
  fragment?: FragmentRecord
  index?: number
}) {
  const messageId = useContext(ChatFragTurnContext)
  const { open, toggle } = useContext(ChatFragPeekContext)
  const expanded =
    Boolean(messageId) &&
    open?.messageId === messageId &&
    open.fragmentId === id

  const label = fragment
    ? fragmentSnippet(fragment.content)
    : index
      ? `碎 ${index}`
      : '碎片'

  return (
    <button
      type="button"
      className={`idea-chat-frag${fragment ? '' : ' is-missing'}`}
      data-frag-id={id}
      aria-expanded={expanded}
      title={fragment ? '查看原文' : '这条碎片已不在这个想法里'}
      onClick={() => {
        if (messageId) toggle(messageId, id)
      }}
    >
      {label}
    </button>
  )
}

export function ChatFragmentOriginal({
  fragment,
}: {
  fragment?: FragmentRecord
}) {
  return (
    <aside className="idea-chat-frag-quote" aria-label="碎片原文">
      <p className="idea-chat-frag-kicker">原文</p>
      {fragment ? (
        <p className="idea-chat-frag-quote-body">{fragment.content}</p>
      ) : (
        <p className="idea-chat-frag-quote-body is-muted">
          这条碎片已不在这个想法里。
        </p>
      )}
    </aside>
  )
}
