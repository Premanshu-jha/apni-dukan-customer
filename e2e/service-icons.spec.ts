import { expect, signedIn, test } from './helpers'

test('every service shows its picture, on the salon page and when confirming', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  const row = (name: string) => page.locator('label', { hasText: name })
  await expect(row('Haircut').locator('svg[data-icon="HAIRCUT"]')).toBeVisible()   // the owner's choice
  await expect(row('Beard trim').locator('svg[data-icon="BEARD"]')).toBeVisible()   // none saved: the one its name fits
  await expect(row('Hair colour').locator('svg[data-icon="OTHER"]')).toBeVisible()   // the owner picked the salon's own
  await expect(row('Haircut').locator('svg')).toHaveAttribute('aria-hidden', 'true')   // the name says it

  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.locator('li', { hasText: 'Haircut' }).locator('svg[data-icon="HAIRCUT"]')).toBeVisible()
})

test('the second set: a picture the owner picked from it is drawn (a trim is a clipper, not the beard)', async ({ page, context, api }) => {
  const { SERVICES } = await import('./mockApi')
  const trim = SERVICES.find((s) => s.id === 'v2') as { icon?: string | null }
  trim.icon = 'TRIM'
  try {
    await signedIn(context, api)
    await page.goto('/salons/s1')
    await expect(page.locator('label', { hasText: 'Beard trim' }).locator('svg[data-icon="TRIM"]')).toBeVisible()
  } finally {
    trim.icon = undefined
  }
})
