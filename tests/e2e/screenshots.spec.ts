// bun run screenshots: the pictures for the README and the docs, light and dark
import { expect, test } from '@playwright/test'

const DIR = 'docs/screenshots'

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme })
    const suffix = scheme === 'dark' ? '-dark' : ''

    test('device list', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByTestId('device-row')).toHaveCount(13)
      await page.screenshot({ path: `${DIR}/devices${suffix}.png`, fullPage: true })
    })

    test('device detail', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('link', { name: 'Temperatursensor Keller' }).click()
      await expect(page.locator('canvas').first()).toBeVisible()
      await page.screenshot({ path: `${DIR}/device${suffix}.png`, fullPage: true })
    })
  })
}
