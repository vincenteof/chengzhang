import OpenAI from 'openai'

import type {
  AiProvider,
  AiResult,
  AiTextEvent,
  StructuredRequest,
  TextRequest,
} from './provider'

function mapError(error: unknown, model: string): AiResult<never> {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { ok: false, code: 'CANCELLED', message: '请求已取消', model }
  }
  const message = error instanceof Error ? error.message : 'AI 请求失败'
  if (/timeout|timed out/i.test(message)) {
    return { ok: false, code: 'AI_TIMEOUT', message: 'AI 请求超时', model }
  }
  if (/refus|safety|content.?filter/i.test(message)) {
    return { ok: false, code: 'AI_REFUSAL', message: '模型拒绝生成该内容', model }
  }
  return { ok: false, code: 'AI_UNAVAILABLE', message, model }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI request timed out')), timeoutMs)
  })
  const onAbort = () => {
    if (timer) clearTimeout(timer)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export class OpenAiProvider implements AiProvider {
  private client: OpenAI

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for openai provider')
    }
    this.client = new OpenAI({ apiKey })
  }

  async generateObject<T>(request: StructuredRequest<T>): Promise<AiResult<T>> {
    const model = process.env.AI_MODEL_PRIMARY || 'gpt-4o'
    try {
      const completion = await withTimeout(
        this.client.chat.completions.create(
          {
            model,
            messages: [
              {
                role: 'system',
                content: `${request.system}\n\n你必须只输出合法 JSON 对象，不要 Markdown 代码围栏。`,
              },
              { role: 'user', content: request.prompt },
            ],
            response_format: { type: 'json_object' },
          },
          { signal: request.signal },
        ),
        request.timeoutMs ?? 90_000,
        request.signal,
      )

      const raw = completion.choices[0]?.message?.content
      if (!raw) {
        return {
          ok: false,
          code: 'AI_OUTPUT_INVALID',
          message: '模型未返回内容',
          model,
        }
      }
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(raw)
      } catch {
        return {
          ok: false,
          code: 'AI_OUTPUT_INVALID',
          message: '模型返回非 JSON',
          model,
        }
      }
      const parsed = request.schema.safeParse(parsedJson)
      if (!parsed.success) {
        return {
          ok: false,
          code: 'AI_OUTPUT_INVALID',
          message: '模型输出不符合 schema',
          model,
        }
      }
      return {
        ok: true,
        data: parsed.data,
        model: completion.model || model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
      }
    } catch (error) {
      return mapError(error, model)
    }
  }

  async generateText(request: TextRequest): Promise<AiResult<string>> {
    const model = process.env.AI_MODEL_PRIMARY || 'gpt-4o'
    try {
      const completion = await withTimeout(
        this.client.chat.completions.create(
          {
            model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.prompt },
            ],
          },
          { signal: request.signal },
        ),
        request.timeoutMs ?? 90_000,
        request.signal,
      )
      const text = completion.choices[0]?.message?.content
      if (!text) {
        return {
          ok: false,
          code: 'AI_OUTPUT_INVALID',
          message: '模型未返回文本',
          model,
        }
      }
      return {
        ok: true,
        data: text,
        model: completion.model || model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
      }
    } catch (error) {
      return mapError(error, model)
    }
  }

  async *streamText(request: TextRequest): AsyncIterable<AiTextEvent> {
    const model = process.env.AI_MODEL_PRIMARY || 'gpt-4o'
    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          stream: true,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
        },
        { signal: request.signal },
      )

      for await (const chunk of stream) {
        if (request.signal?.aborted) {
          yield { type: 'error', message: 'cancelled' }
          return
        }
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          yield { type: 'text-delta', textDelta: delta }
        }
      }
      yield { type: 'done' }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        yield { type: 'error', message: 'cancelled' }
        return
      }
      const message = error instanceof Error ? error.message : 'stream failed'
      yield { type: 'error', message }
    }
  }
}
