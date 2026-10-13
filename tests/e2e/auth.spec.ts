import { expect, test } from '@playwright/test'

// One server, one database: the steps build on each other
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'correct horse battery'

test('the first start asks for a password, then every page is open', async ({ page }) => {
  await page.goto('/events')
  await expect(page).toHaveURL(/\/setup$/)
  await page.getByLabel('Neues Passwort (mindestens 10 Zeichen)').fill('short')
  await page.getByLabel('Passwort wiederholen').fill('short')
  await page
    .getByLabel('Neues Passwort (mindestens 10 Zeichen)')
    .evaluate((input: HTMLInputElement) => {
      input.removeAttribute('minlength')
    })
  await page.getByRole('button', { name: 'Passwort festlegen' }).click()
  await expect(page.getByRole('alert')).toHaveText('Das Passwort braucht mindestens 10 Zeichen.')

  await page.getByLabel('Neues Passwort (mindestens 10 Zeichen)').fill(PASSWORD)
  await page.getByLabel('Passwort wiederholen').fill(PASSWORD)
  await page.getByRole('button', { name: 'Passwort festlegen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Geräte' })).toBeVisible()
  await expect(page.getByText('Noch keine Geräte')).toBeVisible()
})

test('without a session a page leads to the login and back', async ({ page }) => {
  await page.goto('/heatmap')
  await expect(page).toHaveURL(/\/login\?next=%2Fheatmap/)
  await page.getByLabel('Passwort').fill('wrong password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('alert')).toHaveText('Das Passwort stimmt nicht.')
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL(/\/heatmap$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Heatmap' })).toBeVisible()
})

test('the API refuses a request without a session', async ({ request }) => {
  const response = await request.get('/api/events.csv', { headers: { accept: 'text/csv' } })
  expect(response.status()).toBe(401)
})

test('settings change the thresholds and the password; logout ends the session', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible()

  await page.getByLabel('Gut ab (Score)').fill('70')
  await page.getByRole('button', { name: 'Speichern' }).first().click()
  await expect(page.getByText('Gespeichert.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Gut ab (Score)')).toHaveValue('70')

  await page.getByLabel('Aktuelles Passwort').fill('not the password')
  await page.getByLabel('Neues Passwort (mindestens 10 Zeichen)').fill('a new password!')
  await page.getByLabel('Neues Passwort wiederholen').fill('a new password!')
  await page.getByRole('button', { name: 'Passwort ändern' }).click()
  await expect(page.getByText('Das aktuelle Passwort stimmt nicht.')).toBeVisible()
  await page.getByLabel('Aktuelles Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Passwort ändern' }).click()
  await expect(page.getByText(/Passwort geändert/)).toBeVisible()

  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Passwort').fill('a new password!')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Geräte' })).toBeVisible()
})
