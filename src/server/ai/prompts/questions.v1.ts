import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function buildQuestionsPrompt(input: {
  ideaName: string
  confirmedClaim: string
  fragmentsXml: string
  gapsHint?: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：提出最多 3 个高价值追问，帮助作者补足主张所需的真实素材。
问题应具体、可回答，禁止诱导用户接受你的结论。`

  const prompt = `Idea：${input.ideaName}
主张：${input.confirmedClaim}
已知缺口提示：${input.gapsHint || '（无）'}

碎片：
${input.fragmentsXml}

请输出追问。`

  return { system, prompt, promptVersion: 'questions.v1' }
}
