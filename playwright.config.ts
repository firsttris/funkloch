import { defineConfig, devices } from '@playwright/test'
import { SCREENSHOT_NOW } from './tests/e2e/demo'

const PORT = 8099
/** A second server without the demo, for the login */
const AUTH_PORT = 8098
/** bun run screenshots: the demo stands still at one moment (tests/e2e/demo.ts) */
const screenshots = process.env.FUNKLOCH_SCREENSHOTS === '1'
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
    // The browsers share one demo server: tests that change its settings run in Chromium only
    {
      name: 'firefox',
      testIgnore: /screenshots|auth|notifications|rename/,
      use: devices['Desktop Firefox'],
    },
    {
      name: 'webkit',
      testIgnore: /screenshots|auth|notifications|rename/,
      use: devices['Desktop Safari'],
    },
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
      // A running server may be at another time; the screenshots always start their own
      reuseExistingServer: !process.env.CI && !screenshots,
      timeout: 60_000,
      env: {
        FUNKLOCH_DEMO: '1',
        ...(screenshots ? { FUNKLOCH_DEMO_NOW: SCREENSHOT_NOW } : {}),
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
