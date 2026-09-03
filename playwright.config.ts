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
        command: `pnpm exec vite dev --port ${port} --strictPort --host 127.0.0.1`,
        url: baseURL,
        // Don't attach to a personal `vite dev` that may have a real API key.
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          AI_PROVIDER: 'mock',
          AI_FORCE_MOCK: '1',
          APP_ORIGIN: baseURL,
          BETTER_AUTH_URL: baseURL,
        },
      },
})
