import { addDays, istInstant, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

test('a time someone else just took sends the customer back, and that time is gone', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.takenOnce.add(istInstant(tomorrow, '11:30'))

  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: '11:30 AM' }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()

  await expect(page).toHaveURL(/\/salons\/s1\/book$/)
  await expect(page.getByText('Someone just booked that time')).toBeVisible()
  await expect(page.getByRole('button', { name: '11:30 AM' })).toHaveCount(0)

  // Booking another time works, and uses a new idempotency key
  await page.getByRole('button', { name: '1:00 PM' }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1/)
  const keys = api.calls.filter((c) => c.path === '/api/v1/bookings').map((c) => c.idempotencyKey)
  expect(new Set(keys).size).toBe(2)
})

test('moving a booking, then cancelling it', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(tomorrow, '10:00')))

  await page.goto('/bookings/b1')
  await page.getByRole('button', { name: 'Move to another time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByRole('button', { name: '10:00 AM' })).toHaveCount(0) // its own time isn't offered
  await page.getByRole('button', { name: '5:15 PM' }).click()
  await page.getByRole('button', { name: 'Move to 5:15 PM' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  await expect(page.getByText(/5:15 PM/).first()).toBeVisible()
  expect(api.calls.find((c) => c.path.endsWith('/reschedule'))?.body).toEqual({ startAt: istInstant(tomorrow, '17:15') })

  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText('The salon will be told')).toBeVisible()
  await page.getByRole('button', { name: 'Yes, cancel it' }).click()
  await expect(page.getByText('Cancelled by you').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0)
})

test('cancelling within an hour warns that it counts as late; moving is not offered', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], new Date(Date.now() + 30 * 60_000).toISOString()))
  await page.goto('/bookings/b1')
  await expect(page.getByText("Bookings can't be moved within 1 hour of the start.")).toBeVisible()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText('this counts as a late cancel')).toBeVisible()
})
