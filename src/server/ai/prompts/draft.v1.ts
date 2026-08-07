import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function buildDraftPrompt(input: {
  ideaName: string
  confirmedClaim: string
  outlineJson: string
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：按已选结构与碎片写一篇 Markdown 初稿。
优先保留用户有辨识度的原话；禁止编造经历与数据。
素材不足处用「【待补：…】」显式占位，禁止空泛过渡段糊弄。
只输出 Markdown 正文，不要包代码围栏。`

  const prompt = `Idea：${input.ideaName}
主张：${input.confirmedClaim}

结构：
${input.outlineJson}

碎片：
${input.fragmentsXml}

请写初稿。`

  return { system, prompt, promptVersion: 'draft.v1' }
}
