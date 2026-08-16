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
    return {
      ok: false,
      code: 'AI_REFUSAL',
      message: '模型拒绝生成该内容',
      model,
    }
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
    timer = setTimeout(
      () => reject(new Error('AI request timed out')),
      timeoutMs,
    )
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
  private defaultModel: string

  constructor(input: {
    apiKey: string
    baseURL?: string
    defaultModel?: string
  }) {
    if (!input.apiKey) {
      throw new Error('API key is required')
    }
    this.defaultModel = input.defaultModel || 'gpt-4o'
    this.client = new OpenAI({
      apiKey: input.apiKey,
      baseURL: input.baseURL,
    })
  }

  private modelOf(request: { model?: string }) {
    return request.model || this.defaultModel
  }

  async generateObject<T>(request: StructuredRequest<T>): Promise<AiResult<T>> {
    const model = this.modelOf(request)
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
        console.error('[ai:openai] schema validation failed', {
          operation: request.operation,
          model,
          issues: parsed.error.issues.slice(0, 8),
          rawPreview: raw.slice(0, 500),
        })

        // One repair attempt with the validator issues
        try {
          const repair = await withTimeout(
            this.client.chat.completions.create(
              {
                model,
                messages: [
                  {
                    role: 'system',
                    content:
                      '你是 JSON 修复器。只输出合法 JSON 对象，不要解释，不要代码围栏。',
                  },
                  {
                    role: 'user',
                    content: `请把下面 JSON 修正为符合任务「${request.operation}」的结构。\n校验错误：${JSON.stringify(parsed.error.issues.slice(0, 12))}\n原始输出：\n${raw}`,
                  },
                ],
                response_format: { type: 'json_object' },
              },
              { signal: request.signal },
            ),
            Math.min(request.timeoutMs ?? 90_000, 60_000),
            request.signal,
          )
          const repairedRaw = repair.choices[0]?.message?.content
          if (repairedRaw) {
            const repairedJson = JSON.parse(repairedRaw) as unknown
            const repaired = request.schema.safeParse(repairedJson)
            if (repaired.success) {
              return {
                ok: true,
                data: repaired.data,
                model: repair.model || model,
                inputTokens:
                  (completion.usage?.prompt_tokens ?? 0) +
                  (repair.usage?.prompt_tokens ?? 0),
                outputTokens:
                  (completion.usage?.completion_tokens ?? 0) +
                  (repair.usage?.completion_tokens ?? 0),
              }
            }
            console.error('[ai:openai] repair still invalid', {
              operation: request.operation,
              issues: repaired.error.issues.slice(0, 8),
            })
          }
        } catch (repairError) {
          console.error('[ai:openai] repair failed', repairError)
        }

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
      console.error('[ai:openai] generateObject error', {
        operation: request.operation,
        model,
        error,
      })
      return mapError(error, model)
    }
  }

  async generateText(request: TextRequest): Promise<AiResult<string>> {
    const model = this.modelOf(request)
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
    const model = this.modelOf(request)
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
