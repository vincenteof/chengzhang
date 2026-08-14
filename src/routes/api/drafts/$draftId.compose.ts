import { createFileRoute } from '@tanstack/react-router'

import { streamDraftGeneration } from '#/modules/generations/generations.service'
import { getSession } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'

export const Route = createFileRoute('/api/drafts/$draftId/compose')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const session = await getSession()
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 })
        }

        const origin = request.headers.get('origin')
        const appOrigin = process.env.APP_ORIGIN || process.env.BETTER_AUTH_URL
        if (origin && appOrigin && origin !== appOrigin) {
          return new Response('Forbidden', { status: 403 })
        }

        let ideaId = ''
        try {
          const body = (await request.json()) as { ideaId?: unknown }
          ideaId = typeof body.ideaId === 'string' ? body.ideaId : ''
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
        if (!ideaId) {
          return new Response('Bad Request', { status: 400 })
        }

        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            const send = (payload: unknown) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
            }
            try {
              for await (const event of streamDraftGeneration(
                getDb(),
                { ideaId, draftId: params.draftId },
                request.signal,
              )) {
                send(event)
                if (event.type === 'error') break
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : '生成失败'
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
