import { expect, test } from '@playwright/test'

test('the device list refetches when the demo sends new messages', async ({ page }) => {
  const live = page.waitForResponse((r) => r.url().endsWith('/api/live'))
  await page.goto('/')
  expect((await live).headers()['content-type']).toContain('text/event-stream')
  // the demo sends a message every 3 s; the page refetches without a reload
  const refetch = await page.waitForRequest((r) => r.url().includes('/_serverFn/'), {
    timeout: 15_000,
  })
  expect(refetch.method()).toBe('GET')
})
