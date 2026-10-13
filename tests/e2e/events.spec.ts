import { expect, test } from '@playwright/test'

test.describe('events', () => {
  test('lists the events by day and filters by kind', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Ereignisse' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Ereignisse' })).toBeVisible()
    // Nine from the seed; in the evening the terrace socket adds a tenth (weak signal)
    await expect(page.getByTestId('event').nth(8)).toBeVisible()
    expect(await page.getByTestId('event').count()).toBeLessThanOrEqual(10)
    await expect(page.getByText(/an \d von 7 Tagen zwischen 19 und 23 Uhr schwach/)).toBeVisible()
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
    await page.getByRole('link', { name: 'Steckdose Terrasse' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Steckdose Terrasse' })).toBeVisible()
  })
})
