import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'], override: false })

const port = Number(process.env.E2E_PORT || 3100)
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `CHENGZHANG_RUNTIME=node pnpm exec vite dev --port ${port} --strictPort --host 127.0.0.1`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          CHENGZHANG_RUNTIME: 'node',
          AI_PROVIDER: 'mock',
          APP_ORIGIN: baseURL,
          BETTER_AUTH_URL: baseURL,
        },
      },
})
