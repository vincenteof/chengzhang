import { BASE_AUTHORSHIP_V1 } from './base-authorship.v1'

export function serializeChatTranscript(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  if (messages.length === 0) return '（还没有对话）'
  return messages
    .map((m) => `${m.role === 'user' ? '作者' : '协作者'}：${m.content}`)
    .join('\n\n')
}

export function buildIdeaChatPrompt(input: {
  ideaName: string
  ideaDescription?: string | null
  fragmentsXml: string
  transcript: string
}) {
  const system = `${BASE_AUTHORSHIP_V1}

任务：和作者聊这个想法。碎片已经作为素材给你，对话是为了弄清他想写什么。
- 像认真的编辑对谈，短句，一次只推进一点
- 可以追问、复述你听到的判断、指出碎片里的张力
- 不要写完整文章，不要列大纲，不要发明他没说过的经历
- 作者说可以写了，再提醒他点「写一版」`

  const desc = input.ideaDescription?.trim()
  const prompt = `想法：${input.ideaName}
${desc ? `说明：${desc}\n` : ''}
素材碎片：
${input.fragmentsXml}

对话：
${input.transcript}

请回复作者。`

  return { system, prompt, promptVersion: 'idea-chat.v1' }
}
