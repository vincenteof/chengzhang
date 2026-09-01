import { createFileRoute } from '@tanstack/react-router'

import { loadUploadedImage } from '#/server/media/media.service'

export const Route = createFileRoute('/api/media/$mediaId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const object = await loadUploadedImage(params.mediaId)
        if (!object) {
          return new Response('Not Found', { status: 404 })
        }

        const body = object.bytes.slice()
        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': object.mime,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      },
    },
  },
})
