import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function buildClaimPrompt(input: {
  ideaName: string
  ideaDescription: string | null
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：基于碎片提出 2～3 个有实质差异的候选主张。
输出 JSON，符合给定 schema。
若素材不足以形成主张：canFormClaim=false，candidates 可为空，insufficiencyReason 说明缺什么。
禁止把主题词包装成主张。`

  const prompt = `Idea 名称：${input.ideaName}
说明：${input.ideaDescription || '（无）'}

碎片：
${input.fragmentsXml}

请输出候选主张。`

  return { system, prompt, promptVersion: 'claim.v1' }
}
