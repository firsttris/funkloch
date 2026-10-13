import { defineConfig, devices } from '@playwright/test'

const PORT = 8099
/** A second server without the demo, for the login */
const AUTH_PORT = 8098
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
      testIgnore: /screenshots|auth/,
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
    { name: 'firefox', testIgnore: /screenshots|auth/, use: devices['Desktop Firefox'] },
    { name: 'webkit', testIgnore: /screenshots|auth/, use: devices['Desktop Safari'] },
    {
      name: 'auth',
      testMatch: /auth/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${AUTH_PORT}`,
        launchOptions: { executablePath },
      },
    },
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
  // The production build, in demo mode and without; `bun run build` first
  webServer: [
    {
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
    {
      // A fresh database each run, so the first start asks for a password
      command: 'rm -rf test-results/auth-data && bun serve.ts',
      url: `http://localhost:${AUTH_PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATA_DIR: 'test-results/auth-data', PORT: String(AUTH_PORT), LOG_LEVEL: 'warn' },
    },
  ],
})
