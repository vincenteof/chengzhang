import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { MarkdownEditor } from '#/components/editor/MarkdownEditor'
import { MarkdownPreview } from '#/components/editor/MarkdownPreview'
import { getSessionFn } from '#/features/auth/auth.functions'

const sample = `# 探针草稿

一段**可编辑**的 Markdown。

- 支持 GFM
- 预览已 sanitize
- 可用 Undo 撤销最近编辑
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">编辑器探针</h1>
        <Link to="/" className="text-sm text-blue-700 underline">
          返回
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <MarkdownEditor value={content} onChange={setContent} />
        <MarkdownPreview content={content} />
      </div>
    </main>
  )
}
