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

  test('the overview names the bottleneck, the map marks it', async ({ page }) => {
    await page.goto('/')
    const hint = page.getByTestId('bottleneck')
    await expect(hint.getByRole('heading', { name: 'Engpass im Netz' })).toBeVisible()
    await expect(hint).toContainText(
      '4 Geräte hängen über Steckdose Keller Flur ↔ Koordinator (LQI 56/36). Ein Router zwischen diesen beiden würde den Weg stärken.',
    )
    await hint.getByRole('link', { name: 'Auf der Karte zeigen' }).click()
    await expect(page).toHaveURL(/\/network\?.*device=\d+/)
    await expect(
      page.getByRole('heading', { level: 2, name: 'Steckdose Keller Flur' }),
    ).toBeVisible()
    await expect(page.getByText('Engpass · 4 Geräte')).toBeVisible()
    await expect(page.locator('.topo-line.bottleneck')).toHaveCount(1)
  })

  test('a control on the map works after the map was dragged', async ({ page }) => {
    await page.goto('/network')
    const world = page.locator('.topo-world')
    await expect(world).toHaveAttribute('style', /scale/)
    const scale = async () =>
      Number((await world.getAttribute('style'))?.match(/scale\(([\d.]+)\)/)?.[1])
    const frame = await page.locator('.topo-frame').boundingBox()
    if (!frame) throw new Error('no map')
    // an empty spot near the top left, inside the window
    await page.mouse.move(frame.x + 30, frame.y + 120)
    await page.mouse.down()
    await page.mouse.move(frame.x + 90, frame.y + 160, { steps: 5 })
    await page.mouse.up()
    const before = await scale()
    // the click on a control (zoom, "+ n more") is no longer taken for the end of the drag
    await page.getByRole('button', { name: 'Hineinzoomen' }).click()
    await expect.poll(scale).toBeGreaterThan(before)
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
