import { BASE_AUTHORSHIP } from './base-authorship'

export function buildQuestionsPrompt(input: {
  ideaName: string
  confirmedClaim: string
  fragmentsXml: string
  gapsHint?: string
}) {
  const system = `${BASE_AUTHORSHIP}

任务：提出最多 3 个高价值追问，帮助作者补足主张所需的真实素材。
问题应具体、可回答，禁止诱导用户接受你的结论。

你必须只输出一个 JSON 对象（不要代码围栏）：
{
  "questions": [
    {
      "question": "具体可回答的问题",
      "targetGap": "针对的缺口，可 null",
      "whyItMatters": "为何重要，可 null"
    }
  ]
}`

  const prompt = `想法：${input.ideaName}
主张：${input.confirmedClaim}
已知缺口提示：${input.gapsHint || '（无）'}

碎片：
${input.fragmentsXml}

请输出追问 JSON。`

  return { system, prompt, promptVersion: 'questions.v1' }
}
