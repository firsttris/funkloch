// bun run screenshots: the pictures for the README and the docs, light and dark, in English
import { expect, test } from '@playwright/test'
import { DEVICES, SCREENSHOT_NOW } from './demo'

const DIR = 'docs/screenshots'

// The browser's clock at the demo's moment too, so nothing on a page depends on the day it runs
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SCREENSHOT_NOW)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme })
    const suffix = scheme === 'dark' ? '-dark' : ''

    test('network map, the picture on top of the README', async ({ page }) => {
      await page.goto('/network')
      await expect(page.getByRole('link', { name: /^Koordinator/ })).toBeVisible()
      // the build-up animation has ended, so every line and tile is drawn
      await page.waitForTimeout(2500)
      await page.screenshot({
        path: `${DIR}/hero${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('device list', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByTestId('device-row')).toHaveCount(DEVICES)
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

    test('router check', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('link', { name: 'ESP32-C6 Zigbee Router' }).click()
      await expect(page.getByTestId('router-finding')).toBeVisible()
      await expect(page.locator('canvas').first()).toBeVisible()
      await page.screenshot({
        path: `${DIR}/router${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('thread router with transmit errors', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('link', { name: 'ESP32-C6 Thread Router · 52bb…4b82' }).click()
      await expect(page.getByRole('img', { name: /Transmit errors per hour/ })).toBeVisible()
      await expect(page.locator('canvas').first()).toBeVisible()
      await page.screenshot({
        path: `${DIR}/thread-router${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('network map', async ({ page }) => {
      await page.goto('/network')
      await page.getByRole('link', { name: 'Temperatursensor Keller, End device' }).click()
      await expect(page.getByText('Hops to the coordinator')).toBeVisible()
      await page.screenshot({
        path: `${DIR}/network${suffix}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('heatmap', async ({ page }) => {
      await page.goto('/heatmap')
      await expect(page.getByTestId('heat-row')).toHaveCount(DEVICES)
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
