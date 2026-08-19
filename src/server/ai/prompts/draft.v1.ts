import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

/**
 * Article from fragments plus the idea chat (if any).
 */
export function buildDraftPrompt(input: {
  ideaName: string
  ideaDescription?: string | null
  fragmentsXml: string
  chatTranscript?: string | null
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：根据用户提供的碎片和你们的对话，写成一篇连贯、可读的 Markdown 文章。
- 对话比碎片标题更能说明作者想表达什么，优先听从对话里收敛出的方向
- 优先保留用户有辨识度的原话与判断
- 禁止编造用户未提供的经历、数据或出处
- 素材不足处用「【待补：…】」显式占位，不要空泛凑字
- 自行组织结构与段落，不必复述每条碎片编号
- 只输出 Markdown 正文，不要包代码围栏，不要前言后语`

  const desc = input.ideaDescription?.trim()
  const chat = input.chatTranscript?.trim()
  const prompt = `想法名称：${input.ideaName}
${desc ? `补充说明：${desc}\n` : ''}
素材碎片：
${input.fragmentsXml}
${chat ? `\n你们的对话：\n${chat}\n` : ''}
请直接写成完整文章。`

  return { system, prompt, promptVersion: 'draft.v3-chat' }
}
