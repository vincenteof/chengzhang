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

export class MockAiProvider implements AiProvider {
  readonly model = 'mock-model'

  async generateObject<T>(request: StructuredRequest<T>): Promise<AiResult<T>> {
    if (aborted(request.signal)) {
      return { ok: false, code: 'CANCELLED', message: 'Request cancelled', model: this.model }
    }

    // Minimal claim-shaped mock when operation suggests claims
    const payload =
      request.operation === 'claim'
        ? {
            canFormClaim: true,
            insufficiencyReason: null,
            candidates: [
              {
                id: 'cand_1',
                claim: '真正个人化的写作应学习删改，而不是模仿措辞。',
                rationale: '基于现有碎片的张力。',
                evidence: [],
                tensions: [],
                uncertainties: [],
              },
            ],
          }
        : { ok: true }

    const parsed = request.schema.safeParse(payload)
    if (!parsed.success) {
      return {
        ok: false,
        code: 'AI_OUTPUT_INVALID',
        message: 'Mock output failed schema validation',
        model: this.model,
      }
    }

    return { ok: true, data: parsed.data, model: this.model, inputTokens: 10, outputTokens: 20 }
  }

  async generateText(request: TextRequest): Promise<AiResult<string>> {
    if (aborted(request.signal)) {
      return { ok: false, code: 'CANCELLED', message: 'Request cancelled', model: this.model }
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
    const chunks = [
      '这是一段 ',
      '可取消的 ',
      '流式 mock 输出。\n\n',
      '用于 Slice 0 验证 AbortSignal。',
    ]

    try {
      for (const chunk of chunks) {
        if (aborted(request.signal)) {
          yield { type: 'error', message: 'cancelled' }
          return
        }
        await sleep(120, request.signal)
        yield { type: 'text-delta', textDelta: chunk }
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
