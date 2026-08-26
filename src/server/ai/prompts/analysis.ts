import { BASE_AUTHORSHIP } from './base-authorship'

export function buildAnalysisPrompt(input: {
  ideaName: string
  confirmedClaim: string
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP}

任务：对照已确认主张，分析素材支持、矛盾、重复、缺口与不确定点。
每项尽量关联具体 fragmentId。禁止只给通用写作课建议。

你必须只输出一个 JSON 对象（不要 Markdown 代码围栏），字段如下：
{
  "supports": [
    { "fragmentId": "frag_xxx", "howItSupports": "如何支撑主张" }
  ],
  "contradictions": [
    {
      "fragmentIds": ["frag_a", "frag_b"],
      "description": "矛盾或张力描述",
      "isProductiveTension": true
    }
  ],
  "repetitions": [
    { "fragmentIds": ["frag_a", "frag_c"], "description": "重复点" }
  ],
  "gaps": [
    {
      "kind": "experience",
      "description": "缺什么",
      "whyItMatters": "为何影响成文"
    }
  ],
  "uncertainties": ["仍不确定的点"]
}

gaps.kind 只能是：argument | example | experience | explanation | other。
数组可以为空，但字段必须存在。`

  const prompt = `想法：${input.ideaName}
已确认主张：${input.confirmedClaim}

碎片：
${input.fragmentsXml}

请输出分析结果 JSON。`

  return { system, prompt, promptVersion: 'analysis.v1' }
}
