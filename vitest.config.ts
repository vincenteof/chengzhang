import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      'cloudflare:workers': path.resolve(
        import.meta.dirname,
        'src/server/cloudflare-workers.stub.ts',
      ),
    },
  },
})
