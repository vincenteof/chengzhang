import { BASE_AUTHORSHIP } from './base-authorship'

export type SelectionOp = 'organize' | 'expand' | 'polish' | 'feedback'

const rewriteJsonHint = `{
  "rewrittenText": "改写后的完整选区文本",
  "summaryOfChange": "一句话说明改了什么",
  "warnings": ["可选风险提示"]
}`

const feedbackJsonHint = `{
  "overall": "总评",
  "items": [
    {
      "kind": "clarity",
      "detail": "问题描述",
      "suggestion": "可选改进建议，可 null"
    }
  ]
}
kind 只能是 argument | pacing | repetition | clarity | voice | other。`

export function buildSelectionPrompt(input: {
  operation: SelectionOp
  ideaName: string
  confirmedClaim: string | null
  selection: string
  contextBefore: string
  contextAfter: string
  userInstruction?: string | null
  mustKeepPhrases?: string[]
  fragmentsXml?: string
}) {
  const opGuide: Record<SelectionOp, string> = {
    organize:
      '任务：组织选中文字——调整顺序与衔接，不新增核心观点，不编造事实。',
    expand:
      '任务：补写——在素材边界内补充过渡或段落；不足处可用【待补：…】，禁止空话与编造经历。',
    polish:
      '任务：润色——改善表达，尽量保留指定原话与个人语气，不改变核心判断。',
    feedback:
      '任务：反馈——指出论证、节奏、重复、不清晰之处；不要直接改写正文。',
  }

  const system = `${BASE_AUTHORSHIP}

${opGuide[input.operation]}
作用范围仅限用户选中的文字；前后文只作参考。
你必须只输出一个 JSON 对象（不要代码围栏）。
${input.operation === 'feedback' ? feedbackJsonHint : rewriteJsonHint}`

  const mustKeep =
    input.mustKeepPhrases && input.mustKeepPhrases.length > 0
      ? input.mustKeepPhrases.map((p) => `- ${p}`).join('\n')
      : '（无）'

  const prompt = `想法：${input.ideaName}
主张：${input.confirmedClaim || '（未确认）'}
用户补充指令：${input.userInstruction?.trim() || '（无）'}
必须尽量保留的原话：
${mustKeep}

前文上下文：
<<<
${input.contextBefore || '（无）'}
>>>

【选中文本】
<<<
${input.selection}
>>>

后文上下文：
<<<
${input.contextAfter || '（无）'}
>>>

相关碎片（可选参考）：
${input.fragmentsXml || '（无）'}

请输出 JSON。`

  return {
    system,
    prompt,
    promptVersion: `selection-${input.operation}.v1`,
  }
}
