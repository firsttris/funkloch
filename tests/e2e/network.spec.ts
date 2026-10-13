import { expect, test } from '@playwright/test'

test.describe('network map', () => {
  test('shows the zigbee map and selects a device', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Netzwerkkarte' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Netzwerkkarte' })).toBeVisible()
    await page.getByRole('link', { name: 'Temperatursensor Keller, End Device' }).click()
    await expect(page).toHaveURL(/device=\d+/)
    await expect(
      page.getByRole('heading', { level: 2, name: 'Temperatursensor Keller' }),
    ).toBeVisible()
    await expect(page.getByText('Steckdose Waschküche').last()).toBeVisible()
    await page.getByRole('link', { name: 'Verlauf öffnen' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Temperatursensor Keller' }),
    ).toBeVisible()
  })

  test('switches to thread and requests a fresh map', async ({ page }) => {
    await page.goto('/network')
    await page.getByRole('radio', { name: 'Thread' }).click()
    await expect(page).toHaveURL(/protocol=thread/)
    await expect(page.getByRole('link', { name: /^Border Router/ })).toBeVisible()
    await page.getByRole('button', { name: 'Karte jetzt anfordern' }).click()
    await expect(page.getByRole('status')).toContainText('Angefordert')
  })

  test('the snapshot slider goes back in time', async ({ page }) => {
    await page.goto('/network')
    const slider = page.getByLabel('Snapshot')
    await slider.focus()
    await page.keyboard.press('Home')
    await expect(page).toHaveURL(/snapshot=\d+/)
    await page.getByRole('link', { name: 'Temperatursensor Keller, End Device' }).click()
    // a week ago the cellar sensor still hung on the living room socket
    await expect(page.locator('dd', { hasText: 'Steckdose Wohnzimmer' })).toBeVisible()
  })
})
