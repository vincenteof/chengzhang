import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const MEDIA_ID_RE = /^\/api\/media\/(img_[0-9a-f-]{20,})$/i

function mediaDir() {
  const fromEnv = process.env.MEDIA_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(process.cwd(), '.tmp/media')
}

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
    const dir = mediaDir()
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

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    mediaDevPlugin(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
