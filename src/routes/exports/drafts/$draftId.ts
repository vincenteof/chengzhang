import { createFileRoute } from '@tanstack/react-router'

import { getSession } from '#/server/auth/session.server'
import {
  buildMarkdownDocument,
  safeFilename,
} from '#/modules/export/markdown.service'

/**
 * Slice 0 export probe.
 * Real drafts are wired in Slice 1; this endpoint verifies:
 * - same-origin session gate
 * - UTF-8 Markdown download headers
 * - YAML front matter safety
 */
export const Route = createFileRoute('/exports/drafts/$draftId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const session = await getSession()
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 })
        }

        // Origin check for browser navigations that send Origin/Referer
        const origin = request.headers.get('origin')
        const appOrigin = process.env.APP_ORIGIN || process.env.BETTER_AUTH_URL
        if (origin && appOrigin && origin !== appOrigin) {
          return new Response('Forbidden', { status: 403 })
        }

        const meta = {
          title: `Probe export ${params.draftId}`,
          description: 'Slice 0 Markdown export probe',
          slug: params.draftId === 'probe' ? 'probe-export' : params.draftId,
          tags: ['probe', 'alpha'],
        }

        const body = buildMarkdownDocument(
          meta,
          [
            '# 导出探针',
            '',
            '这是 Slice 0 的 Markdown 下载验证内容。',
            '',
            '包含中文、**强调**与代码：`const ok = true`',
            '',
            '```ts',
            'console.log("chengzhang")',
            '```',
            '',
          ].join('\n'),
        )

        const filename = `${safeFilename(meta)}.md`
        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
