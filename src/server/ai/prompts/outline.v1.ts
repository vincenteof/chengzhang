import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function buildOutlinePrompt(input: {
  ideaName: string
  confirmedClaim: string
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：给出 2～3 种实质不同的文章结构方案（不是换标题）。
每种说明叙事逻辑、章节、适用碎片 id、仍缺材料。
素材不足处写在 missingMaterial / missingOverall，不要用空话补齐。`

  const prompt = `Idea：${input.ideaName}
主张：${input.confirmedClaim}

碎片：
${input.fragmentsXml}

请输出结构方案。`

  return { system, prompt, promptVersion: 'outline.v1' }
}
