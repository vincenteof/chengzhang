import { describe, expect, it } from 'vitest'

import { buildIdeaChatPrompt, serializeChatTranscript } from './idea-chat.v1'
import { buildDraftPrompt } from './draft.v1'

describe('idea chat prompts', () => {
  it('serializes transcript in author voice', () => {
    expect(
      serializeChatTranscript([
        { role: 'user', content: '我想写删改' },
        { role: 'assistant', content: '哪一句最不能让步？' },
      ]),
    ).toContain('作者：我想写删改')
  })

  it('puts chat into the draft prompt when present', () => {
    const withChat = buildDraftPrompt({
      ideaName: '声音',
      fragmentsXml: '<fragment id="a">x</fragment>',
      chatTranscript: '作者：就写删改',
    })
    expect(withChat.prompt).toContain('你们的对话')
    expect(withChat.promptVersion).toBe('draft.v3-chat')
    expect(
      buildIdeaChatPrompt({
        ideaName: '声音',
        fragmentsXml: '<fragment id="a">x</fragment>',
        transcript: '作者：hi',
      }).promptVersion,
    ).toBe('idea-chat.v1')
  })
})
