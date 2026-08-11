import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

/**
 * Minimal article generation: idea name + fragments only.
 * Claim/outline are intentionally not part of the default product path.
 */
export function buildDraftPrompt(input: {
  ideaName: string
  ideaDescription?: string | null
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：根据用户提供的碎片素材，写成一篇连贯、可读的 Markdown 文章。
- 优先保留用户有辨识度的原话与判断
- 禁止编造用户未提供的经历、数据或出处
- 素材不足处用「【待补：…】」显式占位，不要空泛凑字
- 自行组织结构与段落，不必复述每条碎片编号
- 只输出 Markdown 正文，不要包代码围栏，不要前言后语`

  const desc = input.ideaDescription?.trim()
  const prompt = `想法名称：${input.ideaName}
${desc ? `补充说明：${desc}\n` : ''}
素材碎片：
${input.fragmentsXml}

请直接写成完整文章。`

  return { system, prompt, promptVersion: 'draft.v2-fragments' }
}
