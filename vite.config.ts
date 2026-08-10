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
    plugins.push(nitro({ rollupConfig: { external: [/^@sentry\//] } }))
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
