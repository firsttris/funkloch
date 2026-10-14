import { expect, test } from '@playwright/test'
import { DEVICES, THREAD_DEVICES } from './demo'

test.describe('device list', () => {
  test('shows every demo device, worst first', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Geräte' })).toBeVisible()
    const rows = page.getByTestId('device-row')
    await expect(rows).toHaveCount(DEVICES)
    await expect(rows.first()).toContainText('Türsensor Garage')
    await expect(rows.first()).toContainText('Offline')
    await expect(rows.nth(1)).toContainText('Schwach')
    // In the evening the terrace socket joins the weak devices (src/demo/devices.ts) and may come
    // before the cellar sensor; at any other time the cellar sensor is second
    const names = await rows.locator('td:nth-child(2)').allInnerTexts()
    const cellar = names.findIndex((n) => n.includes('Temperatursensor Keller'))
    expect([1, 2]).toContain(cellar)
  })

  test('shows the energy scan with both network channels', async ({ page }) => {
    await page.goto('/')
    const card = page.getByRole('region', { name: 'Störpegel 2,4 GHz' })
    await expect(card).toContainText('Zigbee · Kanal 15')
    await expect(card).toContainText('Thread · Kanal 25')
    await expect(card.getByRole('img')).toHaveAttribute('aria-label', /15: −?-?\d+ dBm/)
  })

  test('filters by protocol through the URL', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: `Thread (${THREAD_DEVICES})` }).click()
    await expect(page).toHaveURL(/protocol=thread/)
    await expect(page.getByTestId('device-row')).toHaveCount(THREAD_DEVICES)
    await page.getByRole('button', { name: `Alle (${DEVICES})` }).click()
    await expect(page.getByTestId('device-row')).toHaveCount(DEVICES)
  })

  test('switches the sparkline range', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: '7 Tage' }).click()
    await expect(page).toHaveURL(/range=7d/)
    await expect(page.getByRole('columnheader', { name: 'Verlauf 7 Tage' })).toBeVisible()
  })

  test('switches to English', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sprache wechseln' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Devices' })).toBeVisible()
    await page.getByRole('button', { name: 'Switch language' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Geräte' })).toBeVisible()
  })
})

test.describe('device detail', () => {
  test('opens from the list with chart, connections and events', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Temperatursensor Keller' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Temperatursensor Keller' }),
    ).toBeVisible()
    await expect(page.getByText('Schwach · Trend ↘ fallend')).toBeVisible()
    await expect(
      page.getByRole('img', { name: /LQI-Verlauf über 7 Tage/ }).locator('canvas'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Steckdose Waschküche' })).toBeVisible()
    await expect(page.getByText('Wieder erreichbar').last()).toBeVisible()
  })

  test('a Thread router shows its transmit errors against the threshold', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '52bbac72ec804b82' }).click()
    await expect(page.getByText('Sendefehler 24 h')).toBeVisible()
    await expect(page.getByText(/von [\d.]+ Frames · Schwelle 5 %/)).toBeVisible()
    await expect(page.getByRole('img', { name: /Sendefehler pro Stunde/ })).toBeVisible()
    await expect(page.getByText('Viele Sendefehler')).toBeVisible()
  })

  test('changes the range', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Steckdose Terrasse' }).click()
    await page.getByRole('radio', { name: '24 h' }).click()
    await expect(page).toHaveURL(/range=24h/)
    await expect(page.getByText('Jede Nachricht der letzten 24 h')).toBeVisible()
    await expect(page.getByRole('img', { name: /RSSI-Verlauf über 24 h/ })).toBeVisible()
  })

  test('an unknown device is a not-found page', async ({ page }) => {
    await page.goto('/devices/9999')
    await expect(page.getByRole('heading', { name: 'Gerät nicht gefunden' })).toBeVisible()
  })

  test('an unknown address is a page-not-found page', async ({ page }) => {
    await page.goto('/nowhere')
    await expect(page.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeVisible()
    await page.getByRole('link', { name: 'Alle Geräte' }).click()
    await expect(page.getByTestId('device-row')).toHaveCount(DEVICES)
  })
})

test('healthz reports the demo adapters', async ({ request }) => {
  const response = await request.get('/healthz')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({ ok: true, database: true })
})
