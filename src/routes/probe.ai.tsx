import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { getSessionFn } from '#/features/auth/auth.functions'
import {
  probeStreamTextFn,
  probeStructuredClaimFn,
} from '#/features/generations/probe.functions'

export const Route = createFileRoute('/probe/ai')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    return null
  },
  component: ProbeAiPage,
})

function ProbeAiPage() {
  const structured = useServerFn(probeStructuredClaimFn)
  const stream = useServerFn(probeStreamTextFn)
  const [claimJson, setClaimJson] = useState<string>('')
  const [streamText, setStreamText] = useState('')
  const [status, setStatus] = useState<string>('')

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">AI 探针</h1>
        <Link to="/" className="text-sm text-blue-700 underline">
          返回
        </Link>
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="font-medium">结构化输出（MockAiProvider）</h2>
        <button
          type="button"
          className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
          onClick={async () => {
            setStatus('生成中…')
            const result = await structured()
            if (!result.ok) {
              setStatus(result.error.message)
              return
            }
            setClaimJson(JSON.stringify(result.data, null, 2))
            setStatus('结构化探针成功')
          }}
        >
          生成候选主张
        </button>
        {claimJson ? (
          <pre className="mt-3 overflow-auto rounded bg-neutral-50 p-3 text-xs">{claimJson}</pre>
        ) : null}
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="font-medium">流式输出与取消</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
            onClick={async () => {
              setStatus('流式生成中…')
              const result = await stream({ data: {} })
              if (!result.ok) {
                setStatus(result.error.message)
                return
              }
              setStreamText(result.data.text)
              setStatus(result.data.cancelled ? '已取消' : '流式完成')
            }}
          >
            完整流式
          </button>
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
            onClick={async () => {
              setStatus('流式中（约 150ms 后取消）…')
              const result = await stream({ data: { cancelAfterMs: 150 } })
              if (!result.ok) {
                setStatus(result.error.message)
                return
              }
              setStreamText(result.data.text)
              setStatus(
                result.data.cancelled
                  ? '取消探针成功（中途中断）'
                  : '未能中断（需检查 AbortSignal）',
              )
            }}
          >
            中途取消
          </button>
        </div>
        {streamText ? (
          <pre className="mt-3 whitespace-pre-wrap rounded bg-neutral-50 p-3 text-sm">
            {streamText}
          </pre>
        ) : null}
      </section>

      {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
    </main>
  )
}
