import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

type Props = {
  content: string
  className?: string
  components?: Components
}

export function MarkdownPreview({ content, className, components }: Props) {
  return (
    <div className={className ?? 'prose-cz doc-surface card max-w-none'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content || '*（空内容）*'}
      </ReactMarkdown>
    </div>
  )
}
