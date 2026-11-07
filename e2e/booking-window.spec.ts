import { addDays, istInstant, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

const dayChips = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'Day' }).getByRole('button')

test('the day chips follow the salon’s booking window, when booking and when moving', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.maxDaysAhead = 30
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  // Today plus 30 days
  await expect(dayChips(page)).toHaveCount(31)

  api.maxDaysAhead = 1
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/bookings/b1')
  await page.getByRole('button', { name: 'Move to another time' }).click()
  await expect(dayChips(page)).toHaveCount(2)
  await expect(dayChips(page).last()).toHaveText('Tomorrow')
})

test('a salon answer without maxDaysAhead: today plus the backend default 7 (8 chips)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.maxDaysAhead = undefined
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await expect(dayChips(page)).toHaveCount(8)
})
