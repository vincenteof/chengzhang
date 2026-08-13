import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { MarkdownEditor } from '#/components/editor/MarkdownEditor'
import { MarkdownPreview } from '#/components/editor/MarkdownPreview'
import { getSessionFn } from '#/features/auth/auth.functions'

const sample = `# 探针草稿

一段**可编辑**的 Markdown。

- 支持 GFM
- 预览已 sanitize
- 可用文章/源码模式
`

export const Route = createFileRoute('/probe/editor')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    return null
  },
  component: ProbeEditorPage,
})

function ProbeEditorPage() {
  const [content, setContent] = useState(sample)
  const [mode, setMode] = useState<'inplace' | 'source'>('inplace')

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">编辑器探针</h1>
        <div className="flex items-center gap-3">
          <div className="seg" role="group">
            <button
              type="button"
              className="seg-item"
              aria-pressed={mode === 'inplace'}
              onClick={() => setMode('inplace')}
            >
              文章
            </button>
            <button
              type="button"
              className="seg-item"
              aria-pressed={mode === 'source'}
              onClick={() => setMode('source')}
            >
              源码
            </button>
          </div>
          <Link
            to="/"
            search={{ assignTo: undefined }}
            className="cz-link text-sm"
          >
            返回
          </Link>
        </div>
      </div>
      <p className="meta mb-3">
        当前 {content.length} 字符（真源为 Markdown 字符串）
      </p>
      <MarkdownEditor
        initialContent={sample}
        mode={mode}
        onContentChange={(next) => setContent(next)}
        height="24rem"
      />
      <details className="mt-4">
        <summary className="muted cursor-pointer text-sm">预览</summary>
        <MarkdownPreview
          content={content}
          className="prose-cz card mt-2 max-w-none text-sm"
        />
      </details>
    </main>
  )
}
