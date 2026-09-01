import { createFileRoute } from '@tanstack/react-router'

import { getSession } from '#/server/auth/session.server'
import { isAllowedBrowserOrigin } from '#/server/http-origin.server'
import { saveUploadedImage } from '#/server/media/media.service'

export const Route = createFileRoute('/api/media')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSession()
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 })
        }
        if (!isAllowedBrowserOrigin(request)) {
          return new Response('Forbidden', { status: 403 })
        }

        let form: FormData
        try {
          form = await request.formData()
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
        const file = form.get('file')
        if (!(file instanceof File)) {
          return Response.json({ message: '请选择图片' }, { status: 400 })
        }

        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const saved = await saveUploadedImage({
            bytes,
            filename: file.name || 'image',
            declaredType: file.type,
          })
          return Response.json({
            url: saved.url,
            alt: saved.alt,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '上传失败'
          const code =
            error && typeof error === 'object' && 'code' in error
              ? String(error.code)
              : ''
          const status = code === 'VALIDATION_ERROR' ? 400 : 500
          return Response.json({ message }, { status })
        }
      },
    },
  },
})
