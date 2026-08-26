import { Children, Fragment } from 'react'
import type { ReactNode } from 'react'
import type { Components } from 'react-markdown'

import type { FragmentRecord } from '#/modules/fragments/fragments.service'

import { ChatFragmentChip } from './ChatFragmentChip'
import { isFragmentId, splitFragmentMentions } from './fragment-mentions'

export function ideaChatMarkdownComponents(
  fragments: FragmentRecord[],
): Components {
  const byId = new Map(fragments.map((fragment) => [fragment.id, fragment]))
  const order = new Map(fragments.map((fragment, i) => [fragment.id, i + 1]))

  function chip(id: string) {
    return (
      <ChatFragmentChip id={id} fragment={byId.get(id)} index={order.get(id)} />
    )
  }

  function withMentions(children: ReactNode): ReactNode {
    return Children.map(children, (child, index) => {
      if (typeof child !== 'string') return child
      const parts = splitFragmentMentions(child)
      if (parts.length === 1 && parts[0]?.kind === 'text') return child
      return (
        <Fragment key={index}>
          {parts.map((part, i) =>
            part.kind === 'text' ? (
              part.value
            ) : (
              <Fragment key={`${part.id}-${i}`}>{chip(part.id)}</Fragment>
            ),
          )}
        </Fragment>
      )
    })
  }

  function bind(
    Tag:
      | 'p'
      | 'li'
      | 'td'
      | 'th'
      | 'blockquote'
      | 'em'
      | 'strong'
      | 'del'
      | 'h1'
      | 'h2'
      | 'h3'
      | 'h4',
  ) {
    return ({ children }: { children?: ReactNode }) => (
      <Tag>{withMentions(children)}</Tag>
    )
  }

  return {
    p: bind('p'),
    li: bind('li'),
    td: bind('td'),
    th: bind('th'),
    blockquote: bind('blockquote'),
    em: bind('em'),
    strong: bind('strong'),
    del: bind('del'),
    h1: bind('h1'),
    h2: bind('h2'),
    h3: bind('h3'),
    h4: bind('h4'),
    a: ({ children, href }) => <a href={href}>{withMentions(children)}</a>,
    code: ({ className, children }) => {
      const text = Children.toArray(children).join('').replace(/\n$/, '')
      const trimmed = text.trim()
      if (!className && isFragmentId(trimmed)) return chip(trimmed)
      return <code className={className}>{children}</code>
    },
  }
}
