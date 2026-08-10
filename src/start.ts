import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { createId } from '#/shared/ids'

const requestIdMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const requestId =
      request.headers.get('x-request-id')?.trim() || createId('req')

    return next({
      context: { requestId },
    })
  },
)

const csrfMiddleware = createCsrfMiddleware({
  // Protect same-origin RPC (createServerFn). Auth HTTP handlers under
  // /api/auth remain available for browser form/cookie flows.
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [requestIdMiddleware, csrfMiddleware],
}))
