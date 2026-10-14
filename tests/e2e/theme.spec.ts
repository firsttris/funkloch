import { expect, test } from '@playwright/test'
import packageJson from '../../package.json' with { type: 'json' }

test.describe('header', () => {
  test('shows the version of Funkloch', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner')).toContainText(`v${packageJson.version}`)
  })

  test('the theme follows the system until it is chosen, and stays chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(html).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: 'Darstellung: wie das System' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Darstellung: hell' }).click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Darstellung: dunkel' })).toBeVisible()
    await page.getByRole('button', { name: 'Darstellung: dunkel' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })
})
