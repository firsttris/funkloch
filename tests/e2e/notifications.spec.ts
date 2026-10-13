import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'

let server: Server
const bodies: string[] = []

test.beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      bodies.push(body)
      response.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
})
test.afterAll(() => server.close())

test('rules and channels are saved and a test message reaches the webhook', async ({ page }) => {
  const port = (server.address() as AddressInfo).port
  await page.goto('/events')
  const topology = page.getByRole('checkbox', { name: 'Parent- oder Rollenwechsel' })
  await expect(topology).not.toBeChecked()
  await topology.check()
  await page.getByLabel('Minuten offline bis zur Meldung').fill('90')
  await page
    .getByLabel('Webhook (z. B. Home Assistant, Node-RED)')
    .fill(`http://localhost:${port}/hook`)
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert.', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Parent- oder Rollenwechsel' })).toBeChecked()
  await expect(page.getByLabel('Minuten offline bis zur Meldung')).toHaveValue('90')

  await page.getByRole('button', { name: 'Testnachricht senden' }).click()
  await expect(page.getByText('webhook: angekommen')).toBeVisible()
  expect(JSON.parse(bodies.at(-1) ?? '{}')).toMatchObject({ title: 'Funkloch: Testnachricht' })
})

test('a broken webhook address does not get past the form', async ({ page }) => {
  await page.goto('/events')
  const webhook = page.getByLabel('Webhook (z. B. Home Assistant, Node-RED)')
  await webhook.fill('not a url')
  await page.getByRole('button', { name: 'Speichern' }).click()
  expect(await webhook.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false)
  await expect(page.getByText('Gespeichert.', { exact: true })).not.toBeVisible()
})
