import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function buildClaimPrompt(input: {
  ideaName: string
  ideaDescription: string | null
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：基于碎片提出 2～3 个有实质差异的候选主张。
你必须只输出一个 JSON 对象（不要 Markdown 代码围栏），字段如下：
{
  "canFormClaim": true,
  "insufficiencyReason": null,
  "candidates": [
    {
      "id": "cand_1",
      "claim": "一句中心判断：希望读者相信什么",
      "rationale": "简短解释",
      "evidence": [{ "fragmentId": "真实存在的碎片id", "reason": "为何支撑" }],
      "tensions": ["可选张力"],
      "uncertainties": ["可选不确定"]
    }
  ]
}

规则：
- claim 必须是主张，不是主题摘要；
- evidence.fragmentId 只能使用输入中出现的 fragment id；
- 若不足以形成主张：canFormClaim=false，candidates 可为 []，insufficiencyReason 说明缺什么；
- candidates 最多 3 条，彼此方向要有差异。`

  const prompt = `想法名称：${input.ideaName}
说明：${input.ideaDescription || '（无）'}

碎片：
${input.fragmentsXml}

请输出候选主张 JSON。`

  return { system, prompt, promptVersion: 'claim.v1' }
}
