import { describe, expect, it } from 'vitest'

import { buildIdeaChatPrompt, serializeChatTranscript } from './idea-chat'
import { buildDraftPrompt } from './draft'

describe('idea chat prompts', () => {
  it('serializes transcript in author voice', () => {
    expect(
      serializeChatTranscript([
        { role: 'user', content: '我想写删改' },
        { role: 'assistant', content: '哪一句最不能让步？' },
      ]),
    ).toContain('作者：我想写删改')
  })

  it('strips fragment ids out of chat before drafting', () => {
    const id = 'frag_01a0341e-c758-7659-83b6-0c97e0dcc2d1'
    const built = buildDraftPrompt({
      ideaName: '声音',
      fragmentsXml: `<fragment id="${id}">x</fragment>`,
      chatTranscript: `协作者：看 [${id}] 这句`,
    })
    expect(built.prompt).toContain(`<fragment id="${id}">`)
    expect(built.prompt).not.toContain(`[${id}]`)
    expect(built.prompt).toContain('协作者：看 这句')
  })

  it('puts chat into the draft prompt when present', () => {
    const withChat = buildDraftPrompt({
      ideaName: '声音',
      fragmentsXml: '<fragment id="a">x</fragment>',
      chatTranscript: '作者：就写删改',
    })
    expect(withChat.prompt).toContain('你们的对话')
    expect(withChat.promptVersion).toBe('draft.v4-chat')
    expect(withChat.system).toContain('不要在正文里标注来源')
  })

  it('asks the partner to think with the author, not to draft', () => {
    const built = buildIdeaChatPrompt({
      ideaName: '声音',
      fragmentsXml: '<fragment id="a">x</fragment>',
      transcript: '作者：hi',
    })
    expect(built.promptVersion).toBe('idea-chat.v7')
    expect(built.system).toContain('碎片、对话和作者已经说出来的话')
    expect(built.system).not.toContain('已确认主张')
    expect(built.system).toContain('思考搭档与写作编辑')
    expect(built.system).toContain('不要把对话变成不断向他提问')
    expect(built.system).toContain('写一版')
    expect(built.system).toContain('不要写在对话里')
    expect(built.prompt).toContain('也不要采访')
  })

  it('drops the first-turn cue once a reply exists', () => {
    const built = buildIdeaChatPrompt({
      ideaName: '声音',
      fragmentsXml: '<fragment id="a">x</fragment>',
      transcript: '作者：hi\n\n协作者：哪一句最不能让步？',
    })
    expect(built.prompt).not.toContain('这是第一轮')
  })
})
