import { createFileRoute } from '@tanstack/react-router'

import { exportDraftMarkdown } from '#/modules/drafts/drafts.service'
import { getSession } from '#/server/auth/session.server'
import { getDb } from '#/server/db/client.server'
import { isAllowedBrowserOrigin } from '#/server/http-origin.server'

export const Route = createFileRoute('/exports/drafts/$draftId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const session = await getSession()
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 })
        }

        if (!isAllowedBrowserOrigin(request)) {
          return new Response('Forbidden', { status: 403 })
        }

        try {
          // Probe shortcut kept for Slice 0 smoke links
          if (params.draftId === 'probe') {
            const body = `---\ntitle: Probe export\n---\n\n# 导出探针\n`
            return new Response(body, {
              status: 200,
              headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Content-Disposition': 'attachment; filename="probe-export.md"',
                'Cache-Control': 'no-store',
              },
            })
          }

          const exported = await exportDraftMarkdown(getDb(), params.draftId)
          return new Response(exported.markdown, {
            status: 200,
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
              'Content-Disposition': `attachment; filename="${exported.filename}"`,
              'Cache-Control': 'no-store',
            },
          })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Export failed'
          const status =
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code: string }).code === 'NOT_FOUND'
              ? 404
              : 400
          return new Response(message, { status })
        }
      },
    },
  },
})
