import { createFileRoute } from '@tanstack/react-router'

import { getPool } from '#/server/db/client.server'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await getPool().query('select 1')
          return Response.json({ ok: true })
        } catch {
          return Response.json({ ok: false }, { status: 503 })
        }
      },
    },
  },
})
