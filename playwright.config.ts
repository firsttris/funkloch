import { defineConfig, devices } from '@playwright/test'

const PORT = 8099
// Outside the Playwright image a preinstalled Chromium can be named here
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /screenshots/,
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
    { name: 'firefox', testIgnore: /screenshots/, use: devices['Desktop Firefox'] },
    { name: 'webkit', testIgnore: /screenshots/, use: devices['Desktop Safari'] },
    {
      name: 'screenshots',
      testMatch: /screenshots/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        launchOptions: { executablePath },
      },
    },
  ],
  // The production build in demo mode; `bun run build` first
  webServer: {
    command: 'bun serve.ts',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      FUNKLOCH_DEMO: '1',
      DATA_DIR: 'test-results/demo-data',
      PORT: String(PORT),
      TZ: 'Europe/Berlin',
      LOG_LEVEL: 'warn',
    },
  },
})
