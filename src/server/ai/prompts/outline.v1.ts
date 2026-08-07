import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function buildOutlinePrompt(input: {
  ideaName: string
  confirmedClaim: string
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：给出 2～3 种实质不同的文章结构方案（不是换标题）。
每种说明叙事逻辑、章节、适用碎片 id、仍缺材料。
素材不足处写在 missingMaterial / missingOverall，不要用空话补齐。

你必须只输出一个 JSON 对象（不要代码围栏）：
{
  "options": [
    {
      "id": "out_1",
      "title": "方案标题",
      "approach": "叙事策略",
      "narrativeLogic": "章节如何推进",
      "sections": [
        {
          "id": "sec_1",
          "title": "章节名",
          "purpose": "本章作用",
          "fragmentIds": ["frag_xxx"],
          "missingMaterial": ["仍缺材料"]
        }
      ],
      "missingOverall": ["全文仍缺"]
    }
  ]
}

options 需要 2 或 3 条，彼此结构逻辑要有实质差异。`

  const prompt = `Idea：${input.ideaName}
主张：${input.confirmedClaim}

碎片：
${input.fragmentsXml}

请输出结构方案 JSON。`

  return { system, prompt, promptVersion: 'outline.v1' }
}
