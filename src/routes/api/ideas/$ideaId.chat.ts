import { createFileRoute } from '@tanstack/react-router'

import { streamIdeaChat } from '#/modules/ideas/idea-chat.service'
import { getSession } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import { isAllowedBrowserOrigin } from '#/server/http-origin.server'

export const Route = createFileRoute('/api/ideas/$ideaId/chat')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const session = await getSession()
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 })
        }

        if (!isAllowedBrowserOrigin(request)) {
          return new Response('Forbidden', { status: 403 })
        }

        let content = ''
        try {
          const body = (await request.json()) as { content?: unknown }
          content = typeof body.content === 'string' ? body.content : ''
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
        if (!content.trim()) {
          return new Response('Bad Request', { status: 400 })
        }

        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            const send = (payload: unknown) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
            }
            try {
              for await (const event of streamIdeaChat(
                getDb(),
                { ideaId: params.ideaId, content },
                request.signal,
              )) {
                send(event)
                if (event.type === 'error') break
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : '对话失败'
              send({ type: 'error', message })
            } finally {
              controller.close()
            }
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
