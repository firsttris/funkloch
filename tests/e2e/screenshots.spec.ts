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
      await page.screenshot({
        path: `${DIR}/devices${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('device detail', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('link', { name: 'Temperatursensor Keller' }).click()
      await expect(page.locator('canvas').first()).toBeVisible()
      await page.screenshot({
        path: `${DIR}/device${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('network map', async ({ page }) => {
      await page.goto('/network')
      await page.getByRole('link', { name: 'Temperatursensor Keller, End Device' }).click()
      await expect(page.getByText('Hops zum Koordinator')).toBeVisible()
      await page.screenshot({
        path: `${DIR}/network${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('heatmap', async ({ page }) => {
      await page.goto('/heatmap')
      await expect(page.getByTestId('heat-row')).toHaveCount(13)
      await page.screenshot({
        path: `${DIR}/heatmap${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('events', async ({ page }) => {
      await page.goto('/events')
      await expect(page.getByTestId('event').first()).toBeVisible()
      await page.screenshot({
        path: `${DIR}/events${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })
  })
}
