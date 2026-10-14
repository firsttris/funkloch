// Renames a device of the shared demo server, so it runs in Chromium only (playwright.config.ts)
import { expect, test } from '@playwright/test'

test('the device gets a name of its own on its page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Fensterkontakt Bad' }).click()
  await page.getByRole('button', { name: 'Umbenennen' }).click()
  const field = page.getByRole('textbox', { name: 'Eigener Name für Fensterkontakt Bad' })
  await field.fill('Fenster Badezimmer')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Fenster Badezimmer' })).toBeVisible()
  // empty gives the name from the network back
  await page.getByRole('button', { name: 'Umbenennen' }).click()
  await field.fill('')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Fensterkontakt Bad' })).toBeVisible()
})
