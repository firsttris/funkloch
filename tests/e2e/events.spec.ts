import { expect, test } from '@playwright/test'

test.describe('events', () => {
  test('lists the events by day and filters by kind', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Ereignisse' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Ereignisse' })).toBeVisible()
    await expect(page.getByTestId('event')).toHaveCount(8)
    await expect(page.getByText('Unter Schwelle').first()).toBeVisible()
    await expect(page.getByText(/LQI \d+ \(Schwelle LQI 64\)/)).toBeVisible()
    await page.getByRole('button', { name: 'Topologie (2)' }).click()
    await expect(page).toHaveURL(/kind=topology/)
    await expect(page.getByTestId('event')).toHaveCount(2)
    await expect(page.getByText('Steckdose Wohnzimmer → Rollladen Schlafzimmer')).toBeVisible()
  })

  test('exports the events as CSV', async ({ page }) => {
    await page.goto('/events')
    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Als CSV exportieren' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('funkloch-events-30d.csv')
  })

  test('the device link opens the device', async ({ page }) => {
    await page.goto('/events?kind=signal')
    await page.getByRole('link', { name: 'Steckdose Terrasse' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Steckdose Terrasse' })).toBeVisible()
  })
})
