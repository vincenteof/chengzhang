import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { AppShell } from '#/components/ui/AppShell'
import { getSessionFn, logoutFn } from '#/features/auth/auth.functions'
import { createDraftFn } from '#/features/drafts/drafts.functions'
import { listFragmentsFn } from '#/features/fragments/fragments.functions'
import {
  acceptClaimFn,
  acceptDraftGenerationFn,
  acceptOutlineFn,
  analyzeIdeaFn,
  answerQuestionFn,
  dismissQuestionFn,
  generateClaimsFn,
  generateDraftFn,
  generateOutlinesFn,
  generateQuestionsFn,
  listOpenQuestionsFn,
  rejectGenerationFn,
} from '#/features/generations/generations.functions'
import {
  addIdeaFragmentsFn,
  getIdeaWorkspaceFn,
  removeIdeaFragmentFn,
  updateIdeaFn,
} from '#/features/ideas/ideas.functions'
import type { CandidateClaims } from '#/server/ai/schemas/claim'
import type { IdeaAnalysis } from '#/server/ai/schemas/analysis'
import type { OutlinesOutput } from '#/server/ai/schemas/outline'

export const Route = createFileRoute('/ideas/$ideaId')({
  loader: async ({ params }) => {
    const session = await getSessionFn()
    if (!session.ok || !session.data.user) {
      throw redirect({ to: '/login' })
    }
    const [workspace, allFragments, questions] = await Promise.all([
      getIdeaWorkspaceFn({ data: { ideaId: params.ideaId } }),
      listFragmentsFn({ data: {} }),
      listOpenQuestionsFn({ data: { ideaId: params.ideaId } }),
    ])
    if (!workspace.ok) {
      throw redirect({ to: '/ideas' })
    }
    return {
      user: session.data.user,
      workspace: workspace.data,
      allFragments: allFragments.ok ? allFragments.data : [],
      questions: questions.ok ? questions.data : [],
    }
  },
  component: IdeaWorkspacePage,
})

function IdeaWorkspacePage() {
  const { user, workspace, allFragments, questions: initialQuestions } =
    Route.useLoaderData()
  const { idea, fragments, draft } = workspace
  const router = useRouter()
  const navigate = useNavigate()
  const logout = useServerFn(logoutFn)
  const updateIdea = useServerFn(updateIdeaFn)
  const removeFragment = useServerFn(removeIdeaFragmentFn)
  const addFragments = useServerFn(addIdeaFragmentsFn)
  const createDraft = useServerFn(createDraftFn)

  const generateClaims = useServerFn(generateClaimsFn)
  const acceptClaim = useServerFn(acceptClaimFn)
  const analyzeIdea = useServerFn(analyzeIdeaFn)
  const generateQuestions = useServerFn(generateQuestionsFn)
  const answerQuestion = useServerFn(answerQuestionFn)
  const dismissQuestion = useServerFn(dismissQuestionFn)
  const generateOutlines = useServerFn(generateOutlinesFn)
  const acceptOutline = useServerFn(acceptOutlineFn)
  const generateDraft = useServerFn(generateDraftFn)
  const acceptDraftGen = useServerFn(acceptDraftGenerationFn)
  const rejectGeneration = useServerFn(rejectGenerationFn)

  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [claim, setClaim] = useState(idea.confirmedClaim ?? '')
  const [claimGenId, setClaimGenId] = useState<string | null>(null)
  const [claims, setClaims] = useState<CandidateClaims | null>(null)
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null)
  const [questions, setQuestions] = useState(initialQuestions)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [outlines, setOutlines] = useState<OutlinesOutput | null>(null)
  const [outlineGenId, setOutlineGenId] = useState<string | null>(null)
  const [draftSuggestion, setDraftSuggestion] = useState<{
    generationId: string
    text: string
    draftId: string
  } | null>(null)
  const [answerBusyId, setAnswerBusyId] = useState<string | null>(null)
  const [answerStatus, setAnswerStatus] = useState<string | null>(null)

  // Loader 刷新后同步本地状态（useState 初始值不会自动更新）
  useEffect(() => {
    setQuestions(initialQuestions)
  }, [initialQuestions])

  useEffect(() => {
    setClaim(idea.confirmedClaim ?? '')
  }, [idea.id, idea.confirmedClaim, idea.revision])

  const available = allFragments.filter((f) => !f.ideaIds.includes(idea.id))
  const canAiClaims = fragments.length >= 2

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label)
    setStatus(`${label}…`)
    try {
      return await fn()
    } catch {
      setStatus(`${label}失败`)
      return undefined
    } finally {
      setBusy(null)
    }
  }

  return (
    <AppShell
      userLabel={`${user.name} · ${user.email}`}
      onLogout={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
    >
      <div className="mb-4 text-sm">
        <Link to="/ideas" className="text-blue-700 underline">
          ← Ideas
        </Link>
      </div>

      <h1 className="text-2xl font-semibold">{idea.name}</h1>
      {idea.description ? (
        <p className="mt-1 text-sm text-neutral-600">{idea.description}</p>
      ) : null}
      <p className="mt-2 text-xs text-neutral-500">
        {fragments.length} 条素材 · revision {idea.revision}
        {idea.confirmedClaim ? ' · 已确认主张' : ' · 尚未确认主张'}
      </p>

      {/* 1. Materials */}
      <section className="mt-8">
        <h2 className="text-lg font-medium">1. 素材</h2>
        <ul className="mt-3 space-y-2">
          {fragments.length === 0 ? (
            <li className="text-sm text-neutral-500">还没有素材。</li>
          ) : (
            fragments.map((fragment) => (
              <li
                key={fragment.id}
                className="rounded border border-neutral-200 p-3 text-sm"
              >
                <p className="whitespace-pre-wrap">{fragment.content}</p>
                <button
                  type="button"
                  className="mt-2 text-xs text-red-700 underline"
                  onClick={async () => {
                    if (!window.confirm('从当前 Idea 移出该碎片？')) return
                    const result = await removeFragment({
                      data: { ideaId: idea.id, fragmentId: fragment.id },
                    })
                    if (!result.ok) {
                      setStatus(result.error.message)
                      return
                    }
                    await router.invalidate()
                  }}
                >
                  移出
                </button>
              </li>
            ))
          )}
        </ul>

        {available.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-neutral-700">加入更多碎片</h3>
            <ul className="mt-2 max-h-48 space-y-2 overflow-auto">
              {available.map((fragment) => (
                <li
                  key={fragment.id}
                  className="flex items-start justify-between gap-2 rounded border border-neutral-100 p-2 text-sm"
                >
                  <p className="line-clamp-2 text-neutral-700">{fragment.content}</p>
                  <button
                    type="button"
                    className="shrink-0 rounded border px-2 py-1 text-xs"
                    onClick={async () => {
                      await addFragments({
                        data: { ideaId: idea.id, fragmentIds: [fragment.id] },
                      })
                      await router.invalidate()
                    }}
                  >
                    加入
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 2. Claims */}
      <section className="mt-10 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">2. 方向 · 候选主张</h2>
        <p className="mt-1 text-xs text-neutral-500">
          AI 提出多个方向，你选择、改写或自填。默认使用{' '}
          <code className="rounded bg-neutral-100 px-1">AI_PROVIDER</code>（mock / openai）。
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy) || !canAiClaims}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={async () => {
              setStatus('生成候选主张…（真实模型可能需 10～60 秒，请稍候）')
              const result = await run('生成候选主张', () =>
                generateClaims({ data: { ideaId: idea.id } }),
              )
              if (!result) {
                setStatus('生成候选主张失败：请求异常，请打开浏览器控制台或看终端日志')
                return
              }
              if (!result.ok) {
                setStatus(
                  `生成失败：${result.error.message}${result.error.code ? `（${result.error.code}）` : ''}`,
                )
                return
              }
              setClaims(result.data.claims)
              setClaimGenId(result.data.generation.id)
              setStatus(
                result.data.claims.canFormClaim
                  ? `已生成 ${result.data.claims.candidates.length} 个候选主张，请选择或改写`
                  : result.data.claims.insufficiencyReason || '素材不足',
              )
            }}
          >
            {busy === '生成候选主张' ? '生成中…' : 'AI 生成候选主张'}
          </button>
          {!canAiClaims ? (
            <span className="text-xs text-amber-700 self-center">需要至少 2 条碎片</span>
          ) : null}
        </div>
        {status ? (
          <p
            className={`mt-3 text-sm ${status.includes('失败') ? 'text-red-700' : 'text-neutral-700'}`}
            role="status"
          >
            {status}
          </p>
        ) : null}

        {claims ? (
          <div className="mt-4 space-y-3">
            {!claims.canFormClaim ? (
              <p className="text-sm text-amber-800">{claims.insufficiencyReason}</p>
            ) : null}
            {claims.candidates.map((c) => (
              <article
                key={c.id}
                className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm"
              >
                <p className="font-medium">{c.claim}</p>
                <p className="mt-1 text-neutral-600">{c.rationale}</p>
                {c.evidence.length > 0 ? (
                  <p className="mt-2 text-xs text-neutral-500">
                    依据：{c.evidence.map((e) => e.fragmentId).join('、')}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mt-2 text-xs text-blue-700 underline"
                  onClick={() => setClaim(c.claim)}
                >
                  填入下方编辑框
                </button>
              </article>
            ))}
          </div>
        ) : null}

        <textarea
          className="mt-4 w-full rounded border border-neutral-300 p-2 text-sm"
          rows={3}
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          placeholder="确认或自写主张：希望读者相信什么？"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy) || !claim.trim()}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={async () => {
              if (claimGenId) {
                const result = await acceptClaim({
                  data: {
                    ideaId: idea.id,
                    generationId: claimGenId,
                    claimText: claim,
                    baseRevision: idea.revision,
                  },
                })
                if (!result.ok) {
                  setStatus(result.error.message)
                  return
                }
              } else {
                const result = await updateIdea({
                  data: {
                    id: idea.id,
                    baseRevision: idea.revision,
                    confirmedClaim: claim,
                  },
                })
                if (!result.ok) {
                  setStatus(result.error.message)
                  return
                }
              }
              setStatus('主张已确认')
              await router.invalidate()
            }}
          >
            确认主张
          </button>
          {claimGenId ? (
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm"
              onClick={async () => {
                await rejectGeneration({ data: { generationId: claimGenId } })
                setClaims(null)
                setClaimGenId(null)
                setStatus('已拒绝本轮候选')
              }}
            >
              拒绝本轮候选
            </button>
          ) : null}
        </div>
        {idea.confirmedClaim ? (
          <p className="mt-3 text-sm text-green-800">
            当前确认：{idea.confirmedClaim}
          </p>
        ) : null}
      </section>

      {/* 3. Analysis + Questions */}
      <section className="mt-10 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">3. 发展 · 分析与追问</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy) || !idea.confirmedClaim}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={async () => {
              setStatus('分析素材中…')
              const result = await run('分析素材', () =>
                analyzeIdea({ data: { ideaId: idea.id } }),
              )
              if (!result) {
                setStatus('分析失败：请求异常')
                return
              }
              if (!result.ok) {
                setStatus(
                  `分析失败：${result.error.message}${result.error.code ? `（${result.error.code}）` : ''}`,
                )
                return
              }
              setAnalysis(result.data.analysis)
              setStatus('分析完成')
            }}
          >
            {busy === '分析素材' ? '分析中…' : 'AI 分析素材'}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || !idea.confirmedClaim}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={async () => {
              setStatus('生成追问中…')
              const result = await run('生成追问', () =>
                generateQuestions({ data: { ideaId: idea.id } }),
              )
              if (!result) {
                setStatus('追问失败：请求异常')
                return
              }
              if (!result.ok) {
                setStatus(
                  `追问失败：${result.error.message}${result.error.code ? `（${result.error.code}）` : ''}`,
                )
                return
              }
              setQuestions(result.data.questions)
              setStatus(`已生成 ${result.data.questions.length} 个追问`)
              await router.invalidate()
            }}
          >
            {busy === '生成追问' ? '生成中…' : 'AI 追问'}
          </button>
        </div>
        {status &&
        (status.includes('分析') ||
          status.includes('追问') ||
          status.includes('失败')) ? (
          <p
            className={`mt-3 text-sm ${status.includes('失败') ? 'text-red-700' : 'text-neutral-700'}`}
            role="status"
          >
            {status}
          </p>
        ) : null}

        {analysis ? (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <h3 className="font-medium">支持</h3>
              <ul className="list-disc pl-5 text-neutral-700">
                {analysis.supports.map((s, i) => (
                  <li key={i}>
                    [{s.fragmentId}] {s.howItSupports}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">矛盾 / 张力</h3>
              <ul className="list-disc pl-5 text-neutral-700">
                {analysis.contradictions.map((c, i) => (
                  <li key={i}>
                    {c.description}
                    {c.isProductiveTension ? '（可能有价值）' : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">缺口</h3>
              <ul className="list-disc pl-5 text-neutral-700">
                {analysis.gaps.map((g, i) => (
                  <li key={i}>
                    [{g.kind}] {g.description} — {g.whyItMatters}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-medium">开放追问</h3>
          {questions.length === 0 ? (
            <p className="text-sm text-neutral-500">暂无追问。</p>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="rounded border border-neutral-200 p-3 text-sm">
                <p className="font-medium">{q.question}</p>
                {q.whyItMatters ? (
                  <p className="mt-1 text-xs text-neutral-500">{q.whyItMatters}</p>
                ) : null}
                {q.answeredFragmentId ? (
                  <p className="mt-2 text-xs text-green-700">已回答并写入碎片（见上方素材列表）</p>
                ) : (
                  <>
                    <textarea
                      className="mt-2 w-full rounded border p-2 text-sm"
                      rows={2}
                      placeholder="你的回答会成为新碎片并加入本 Idea"
                      value={answerDrafts[q.id] || ''}
                      onChange={(e) =>
                        setAnswerDrafts((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={answerBusyId === q.id}
                        className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                        onClick={async () => {
                          const answer = (answerDrafts[q.id] || '').trim()
                          if (!answer) {
                            setAnswerStatus('请先填写回答内容')
                            return
                          }
                          setAnswerBusyId(q.id)
                          setAnswerStatus('保存中…')
                          try {
                            const result = await answerQuestion({
                              data: {
                                ideaId: idea.id,
                                questionId: q.id,
                                answer,
                              },
                            })
                            if (!result.ok) {
                              setAnswerStatus(`保存失败：${result.error.message}`)
                              return
                            }
                            // 乐观更新：立刻显示已回答，避免 loader 刷新后 state 仍旧
                            setQuestions((prev) =>
                              prev.map((item) =>
                                item.id === q.id
                                  ? {
                                      ...item,
                                      answeredFragmentId: result.data.fragmentId,
                                    }
                                  : item,
                              ),
                            )
                            setAnswerDrafts((prev) => {
                              const next = { ...prev }
                              delete next[q.id]
                              return next
                            })
                            setAnswerStatus('已保存为新碎片，并加入当前 Idea')
                            setStatus('回答已保存为新碎片')
                            await router.invalidate()
                          } catch {
                            setAnswerStatus('保存失败：网络或服务器异常')
                          } finally {
                            setAnswerBusyId(null)
                          }
                        }}
                      >
                        {answerBusyId === q.id ? '保存中…' : '保存回答'}
                      </button>
                      <button
                        type="button"
                        disabled={answerBusyId === q.id}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        onClick={async () => {
                          setAnswerBusyId(q.id)
                          try {
                            const result = await dismissQuestion({
                              data: { ideaId: idea.id, questionId: q.id },
                            })
                            if (!result.ok) {
                              setAnswerStatus(`忽略失败：${result.error.message}`)
                              return
                            }
                            setQuestions((prev) => prev.filter((item) => item.id !== q.id))
                            setAnswerStatus('已忽略该追问')
                            await router.invalidate()
                          } finally {
                            setAnswerBusyId(null)
                          }
                        }}
                      >
                        忽略
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
          {answerStatus ? (
            <p
              className={`text-sm ${answerStatus.includes('失败') || answerStatus.includes('请先') ? 'text-red-700' : 'text-green-800'}`}
              role="status"
            >
              {answerStatus}
            </p>
          ) : null}
        </div>
      </section>

      {/* 4. Outline + Draft */}
      <section className="mt-10 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">4. 结构与初稿</h2>
        <p className="mt-1 text-xs text-neutral-500">
          选择结构后创建/更新 Draft；再生成初稿，确认后写入正文。
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy) || !idea.confirmedClaim}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={async () => {
              const result = await run('生成结构', () =>
                generateOutlines({ data: { ideaId: idea.id } }),
              )
              if (!result?.ok) {
                setStatus(result?.error.message || '失败')
                return
              }
              setOutlines(result.data.outlines)
              setOutlineGenId(result.data.generation.id)
              setStatus('已生成结构方案')
            }}
          >
            {busy === '生成结构' ? '生成中…' : 'AI 生成结构'}
          </button>

          {draft ? (
            <button
              type="button"
              disabled={Boolean(busy) || !idea.confirmedClaim}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={async () => {
                const result = await run('生成初稿', () =>
                  generateDraft({
                    data: { ideaId: idea.id, draftId: draft.id },
                  }),
                )
                if (!result?.ok) {
                  setStatus(result?.error.message || '失败')
                  return
                }
                setDraftSuggestion({
                  generationId: result.data.generation.id,
                  text: result.data.draftText,
                  draftId: draft.id,
                })
                setStatus('初稿建议已生成，确认后写入草稿')
              }}
            >
              {busy === '生成初稿' ? '生成中…' : 'AI 生成初稿'}
            </button>
          ) : null}

          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={async () => {
              if (draft) {
                await navigate({
                  to: '/drafts/$draftId',
                  params: { draftId: draft.id },
                })
                return
              }
              const result = await createDraft({
                data: { ideaId: idea.id, title: idea.name },
              })
              if (!result.ok) {
                setStatus(result.error.message)
                return
              }
              await navigate({
                to: '/drafts/$draftId',
                params: { draftId: result.data.id },
              })
            }}
          >
            {draft ? '打开草稿编辑器' : '创建空白草稿'}
          </button>
        </div>

        {outlines ? (
          <div className="mt-4 space-y-3">
            {outlines.options.map((opt) => (
              <article
                key={opt.id}
                className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm"
              >
                <p className="font-medium">{opt.title}</p>
                <p className="mt-1 text-neutral-600">{opt.approach}</p>
                <p className="mt-1 text-xs text-neutral-500">{opt.narrativeLogic}</p>
                <ol className="mt-2 list-decimal pl-5">
                  {opt.sections.map((s) => (
                    <li key={s.id}>
                      {s.title} — {s.purpose}
                      {s.missingMaterial.length > 0
                        ? `（缺：${s.missingMaterial.join('；')}）`
                        : ''}
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className="mt-2 rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                  disabled={!outlineGenId || Boolean(busy)}
                  onClick={async () => {
                    if (!outlineGenId) return
                    const result = await acceptOutline({
                      data: {
                        ideaId: idea.id,
                        generationId: outlineGenId,
                        optionId: opt.id,
                      },
                    })
                    if (!result.ok) {
                      setStatus(result.error.message)
                      return
                    }
                    setStatus('已选择结构并写入 Draft')
                    await router.invalidate()
                    await navigate({
                      to: '/drafts/$draftId',
                      params: { draftId: result.data.draftId },
                    })
                  }}
                >
                  采用此结构并进入草稿
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {draftSuggestion ? (
          <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
            <p className="font-medium">初稿建议（确认前不会写入）</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs">
              {draftSuggestion.text}
            </pre>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                onClick={async () => {
                  if (!draft) return
                  const result = await acceptDraftGen({
                    data: {
                      generationId: draftSuggestion.generationId,
                      draftId: draftSuggestion.draftId,
                      baseRevision: draft.revision,
                    },
                  })
                  if (!result.ok) {
                    setStatus(result.error.message)
                    return
                  }
                  setDraftSuggestion(null)
                  setStatus('初稿已写入 Draft')
                  await navigate({
                    to: '/drafts/$draftId',
                    params: { draftId: draft.id },
                  })
                }}
              >
                接受并打开草稿
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={async () => {
                  await rejectGeneration({
                    data: { generationId: draftSuggestion.generationId },
                  })
                  setDraftSuggestion(null)
                  setStatus('已拒绝初稿建议')
                }}
              >
                拒绝
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {status ? (
        <p className="mt-6 text-sm text-neutral-600" role="status">
          {status}
        </p>
      ) : null}
    </AppShell>
  )
}
