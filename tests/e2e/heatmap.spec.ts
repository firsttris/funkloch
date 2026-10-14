import { expect, test } from '@playwright/test'
import { DEVICES, THREAD_DEVICES } from './demo'

test.describe('heatmap', () => {
  test('shows every device and the findings', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Heatmap' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Heatmap' })).toBeVisible()
    await expect(page.getByTestId('heat-row')).toHaveCount(DEVICES)
    await expect(page.getByText('Wiederkehrendes Muster')).toBeVisible()
    await expect(page.getByText(/zwischen 19 und 23 Uhr schwach/)).toBeVisible()
    await expect(page.getByText('Ausfall')).toBeVisible()
  })

  test('switches to 30 days and filters by protocol', async ({ page }) => {
    await page.goto('/heatmap')
    await page.getByRole('radio', { name: '30 Tage' }).click()
    await expect(page.getByRole('heading', { name: 'Alle Geräte · letzte 30 Tage' })).toBeVisible()
    await page.getByRole('button', { name: `Thread (${THREAD_DEVICES})` }).click()
    await expect(page.getByTestId('heat-row')).toHaveCount(THREAD_DEVICES)
  })
})
