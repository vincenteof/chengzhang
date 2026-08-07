import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

type Props = {
  content: string
  className?: string
}

export function MarkdownPreview({ content, className }: Props) {
  return (
    <div
      className={
        className ??
        'prose prose-neutral max-w-none rounded border border-neutral-200 bg-white p-4 text-sm'
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content || '*（空内容）*'}
      </ReactMarkdown>
    </div>
  )
}
