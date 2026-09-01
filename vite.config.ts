import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Local `pnpm dev` uses Nitro/Node so `pg` can reach local Postgres reliably.
 * Cloudflare workerd often hangs on local TCP Postgres (timeout → request canceled).
 *
 * Production / preview / explicit CF dev use the official Cloudflare plugin.
 *
 * - pnpm dev          → Node (Nitro)
 * - pnpm dev:cf       → Cloudflare local workerd
 * - pnpm build/deploy → Cloudflare Workers
 */
const MEDIA_ID_RE = /^\/api\/media\/(img_[0-9a-f-]{20,})$/i

/** Vite 404s `<img>` requests (Sec-Fetch-Dest: image) before Nitro sees /api/media. */
function mediaDevPlugin(): PluginOption {
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    const pathname = req.url?.split('?')[0] ?? ''
    const match = MEDIA_ID_RE.exec(pathname)
    if (!match) {
      next()
      return
    }
    const id = match[1]!
    const dir = path.join(process.cwd(), '.tmp/media')
    try {
      const bytes = await readFile(path.join(dir, id))
      const mime = (await readFile(path.join(dir, `${id}.mime`), 'utf8')).trim()
      res.statusCode = 200
      res.setHeader('Content-Type', mime || 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      res.end(bytes)
    } catch {
      next()
    }
  }

  return {
    name: 'chengzhang-media-dev',
    apply: 'serve',
    configureServer(server) {
      return () => {
        server.middlewares.use(middleware)
        const stack = server.middlewares.stack
        const last = stack.pop()
        if (last) stack.unshift(last)
      }
    },
  }
}

function useCloudflareRuntime(command: 'build' | 'serve'): boolean {
  if (process.env.CHENGZHANG_RUNTIME === 'node') return false
  if (process.env.CHENGZHANG_RUNTIME === 'cloudflare') return true
  // Vite: command is "serve" for dev/preview, "build" for production build
  if (command === 'build') return true
  if (process.env.npm_lifecycle_event === 'preview') return true
  if (process.env.npm_lifecycle_event === 'dev:cf') return true
  return false
}

export default defineConfig(({ command }) => {
  const cloudflareRuntime = useCloudflareRuntime(command)

  const plugins: PluginOption[] = []

  if (cloudflareRuntime) {
    plugins.push(cloudflare({ viteEnvironment: { name: 'ssr' } }))
  } else {
    plugins.push(
      mediaDevPlugin(),
      nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    )
  }

  plugins.push(devtools(), tailwindcss(), tanstackStart(), viteReact())

  return {
    resolve: {
      tsconfigPaths: true,
      // Under Node/Nitro there is no real `cloudflare:workers` module.
      alias: cloudflareRuntime
        ? undefined
        : {
            'cloudflare:workers': path.resolve(
              import.meta.dirname,
              'src/server/cloudflare-workers.stub.ts',
            ),
          },
    },
    plugins,
  }
})
