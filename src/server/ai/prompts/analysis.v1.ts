import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function buildAnalysisPrompt(input: {
  ideaName: string
  confirmedClaim: string
  fragmentsXml: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：对照已确认主张，分析素材支持、矛盾、重复、缺口与不确定点。
每项尽量关联具体 fragmentId。禁止只给通用写作课建议。`

  const prompt = `Idea：${input.ideaName}
已确认主张：${input.confirmedClaim}

碎片：
${input.fragmentsXml}

请输出分析结果。`

  return { system, prompt, promptVersion: 'analysis.v1' }
}
