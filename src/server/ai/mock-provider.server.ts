import type {
  AiProvider,
  AiResult,
  AiTextEvent,
  StructuredRequest,
  TextRequest,
} from './provider'

function aborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted)
}

async function sleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function extractFragmentIds(prompt: string): string[] {
  const ids = [...prompt.matchAll(/id="([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter(Boolean)
  return [...new Set(ids)]
}

export class MockAiProvider implements AiProvider {
  readonly model = 'mock-model'

  async generateObject<T>(request: StructuredRequest<T>): Promise<AiResult<T>> {
    if (aborted(request.signal)) {
      return {
        ok: false,
        code: 'CANCELLED',
        message: 'Request cancelled',
        model: this.model,
      }
    }

    const fragmentIds = extractFragmentIds(request.prompt)
    const fid = (i: number) =>
      fragmentIds[i] || fragmentIds[0] || 'frag_unknown'

    let payload: unknown
    switch (request.operation) {
      case 'claim':
        payload = {
          canFormClaim: fragmentIds.length >= 2,
          insufficiencyReason:
            fragmentIds.length >= 2
              ? null
              : '至少需要 2 条非空碎片才能形成主张',
          candidates:
            fragmentIds.length >= 2
              ? [
                  {
                    id: 'cand_1',
                    claim: '真正个人化的写作应学习删改，而不是模仿措辞。',
                    rationale: '基于现有碎片中对「模仿 vs 删改」的张力。',
                    evidence: [
                      { fragmentId: fid(0), reason: '直接触及个人声音' },
                      { fragmentId: fid(1), reason: '提供对立面或例证' },
                    ],
                    tensions: ['完整表达欲与克制之间的矛盾'],
                    uncertainties: ['作者是否愿意公开暴露删改过程'],
                  },
                  {
                    id: 'cand_2',
                    claim:
                      'AI 写作工具的价值在于放大未成形的判断，而不是替用户发明立场。',
                    rationale: '强调工具边界与作者所有权。',
                    evidence: [{ fragmentId: fid(0), reason: '核心关切' }],
                    tensions: [],
                    uncertainties: ['读者是否认同这一工具伦理'],
                  },
                  {
                    id: 'cand_3',
                    claim:
                      '未完成的思想需要被保存为可回流的素材，而不是被过早总结。',
                    rationale: '从捕捉与整理摩擦出发。',
                    evidence: [
                      {
                        fragmentId: fid(Math.min(1, fragmentIds.length - 1)),
                        reason: '素材状态',
                      },
                    ],
                    tensions: ['整理欲与捕捉流畅的冲突'],
                    uncertainties: [],
                  },
                ]
              : [],
        }
        break
      case 'analysis':
        payload = {
          supports: fragmentIds.slice(0, 2).map((id) => ({
            fragmentId: id,
            howItSupports: '与主张方向一致或提供例证',
          })),
          contradictions:
            fragmentIds.length >= 2
              ? [
                  {
                    fragmentIds: [fid(0), fid(1)],
                    description: '两条素材在力度或立场上存在张力',
                    isProductiveTension: true,
                  },
                ]
              : [],
          repetitions: [],
          gaps: [
            {
              kind: 'experience',
              description: '缺少一次具体的个人删改/写作经历',
              whyItMatters: '否则主张容易停留在原则口号',
            },
            {
              kind: 'example',
              description: '缺少反例：模仿措辞失败或成功的对比',
              whyItMatters: '帮助读者看见判断的边界',
            },
          ],
          uncertainties: ['作者对「个人声音」的操作定义仍可更具体'],
        }
        break
      case 'questions':
        payload = {
          questions: [
            {
              question: '你最近一次删掉自己满意句子的时刻是什么？为什么删？',
              targetGap: '个人经历',
              whyItMatters: '把主张落到可感知的场景',
            },
            {
              question:
                '有没有一段你绝不愿被 AI 改写的原话？那句话守住了什么？',
              targetGap: '原话边界',
              whyItMatters: '明确作者所有权',
            },
            {
              question: '如果读者只记住一句，你希望是反模仿，还是反过早总结？',
              targetGap: '主张取舍',
              whyItMatters: '避免双主题并行',
            },
          ],
        }
        break
      case 'outline':
        payload = {
          options: [
            {
              id: 'out_1',
              title: '从摩擦到主张',
              approach: '问题驱动：先呈现写作摩擦，再亮出主张',
              narrativeLogic: '场景 → 张力 → 主张 → 反例 → 可操作结论',
              sections: [
                {
                  id: 'sec_1',
                  title: '闪念为什么变不成文章',
                  purpose: '建立共鸣',
                  fragmentIds: fragmentIds.slice(0, 1),
                  missingMaterial: [],
                },
                {
                  id: 'sec_2',
                  title: '主张：学习删改',
                  purpose: '给出中心判断',
                  fragmentIds: fragmentIds.slice(0, 2),
                  missingMaterial: ['一次具体删改故事'],
                },
                {
                  id: 'sec_3',
                  title: '工具边界',
                  purpose: '划清 AI 能做什么',
                  fragmentIds: fragmentIds.slice(1, 3),
                  missingMaterial: [],
                },
              ],
              missingOverall: ['读者可执行的一小步'],
            },
            {
              id: 'out_2',
              title: '先亮主张再拆解',
              approach: '论点优先',
              narrativeLogic: '主张 → 证据 → 矛盾 → 追问后的补强',
              sections: [
                {
                  id: 'sec_a',
                  title: '中心主张',
                  purpose: '开篇立论',
                  fragmentIds: fragmentIds.slice(0, 1),
                  missingMaterial: [],
                },
                {
                  id: 'sec_b',
                  title: '素材如何支撑与打架',
                  purpose: '展示张力',
                  fragmentIds: fragmentIds,
                  missingMaterial: ['更清晰的对立表述'],
                },
              ],
              missingOverall: [],
            },
          ],
        }
        break
      case 'organize':
      case 'expand':
      case 'polish': {
        const selected =
          request.prompt
            .match(/【选中文本】\s*<<<\s*([\s\S]*?)\s*>>>/)?.[1]
            ?.trim() || '（空选区）'
        const prefix =
          request.operation === 'organize'
            ? '【组织】'
            : request.operation === 'expand'
              ? '【补写】'
              : '【润色】'
        payload = {
          rewrittenText:
            request.operation === 'expand'
              ? `${selected}\n\n${prefix}在此补一句过渡：把上文与下文轻轻接上，不发明新经历。`
              : request.operation === 'polish'
                ? selected
                    .replace(/非常非常/g, '很')
                    .replace(/进行(了|一个)/g, '$1')
                    .trim() || `${prefix}${selected}`
                : selected
                    .split(/\n+/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .join('\n\n'),
          summaryOfChange:
            request.operation === 'organize'
              ? '调整段落衔接与顺序，未新增核心观点'
              : request.operation === 'expand'
                ? '在选区末补充过渡，并标出素材边界'
                : '轻微压缩空话，尽量保留原判断',
          warnings:
            request.operation === 'expand'
              ? ['补写内容需你确认是否符合亲身经历']
              : [],
        }
        break
      }
      case 'feedback':
        payload = {
          overall: '选段整体可读，但仍有可 sharpen 的论证与节奏点。',
          items: [
            {
              kind: 'clarity',
              detail: '有些句子偏抽象，读者可能抓不住具体判断。',
              suggestion: '补一个可感知的小例子或场景。',
            },
            {
              kind: 'repetition',
              detail: '相近意思可能出现两次。',
              suggestion: '合并重复句，只保留最有力的一句。',
            },
            {
              kind: 'argument',
              detail: '主张与例证之间的推理链可以更显式。',
              suggestion: null,
            },
          ],
        }
        break
      default:
        payload = { ok: true }
    }

    const parsed = request.schema.safeParse(payload)
    if (!parsed.success) {
      return {
        ok: false,
        code: 'AI_OUTPUT_INVALID',
        message: 'Mock output failed schema validation',
        model: this.model,
      }
    }

    return {
      ok: true,
      data: parsed.data,
      model: this.model,
      inputTokens: 10,
      outputTokens: 40,
    }
  }

  async generateText(request: TextRequest): Promise<AiResult<string>> {
    if (aborted(request.signal)) {
      return {
        ok: false,
        code: 'CANCELLED',
        message: 'Request cancelled',
        model: this.model,
      }
    }

    if (request.operation === 'chat') {
      return {
        ok: true,
        data: '我听到这些碎片里有一个反复出现的判断。你更想写给谁看？还是先把最不能让步的那句说完整。',
        model: this.model,
        inputTokens: 12,
        outputTokens: 40,
      }
    }

    if (request.operation === 'draft') {
      const ids = extractFragmentIds(request.prompt)
      const body = [
        '# 初稿（Mock）',
        '',
        '这是基于你的主张与素材生成的可编辑初稿。以下判断来自现有碎片，不足处已标出。',
        '',
        '## 开篇',
        '',
        ids[0]
          ? `围绕素材开始：相关碎片 ${ids[0]}。真正的个人声音，往往出现在你决定删掉什么的时候。`
          : '【待补：开篇场景】',
        '',
        '## 展开',
        '',
        'AI 可以帮你连接与重组，但不能替你发明经历。若素材打架，那可能是文章最有力的部分。',
        '',
        '## 未完成处',
        '',
        '【待补：一次具体的个人经历】',
        '【待补：你希望读者带走的一句话】',
        '',
      ].join('\n')
      return {
        ok: true,
        data: body,
        model: this.model,
        inputTokens: 20,
        outputTokens: 80,
      }
    }

    return {
      ok: true,
      data: `【mock】针对「${request.operation}」的示例输出。`,
      model: this.model,
      inputTokens: 8,
      outputTokens: 16,
    }
  }

  async *streamText(request: TextRequest): AsyncIterable<AiTextEvent> {
    const full = await this.generateText(request)
    if (!full.ok) {
      yield { type: 'error', message: full.message }
      return
    }
    const chunkSize = 24
    try {
      for (let i = 0; i < full.data.length; i += chunkSize) {
        if (aborted(request.signal)) {
          yield { type: 'error', message: 'cancelled' }
          return
        }
        await sleep(40, request.signal)
        yield {
          type: 'text-delta',
          textDelta: full.data.slice(i, i + chunkSize),
        }
      }
      yield { type: 'done' }
    } catch {
      yield { type: 'error', message: 'cancelled' }
    }
  }
}

export function createMockAiProvider() {
  return new MockAiProvider()
}
