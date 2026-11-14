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
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()

  await expect(page).toHaveURL(/\/salons\/s1\/book$/)
  await expect(page.getByText('Someone just booked that time')).toBeVisible()
  await expect(page.getByRole('button', { name: /^11:30 AM to / })).toHaveCount(0)

  // Booking another time works, and uses a new idempotency key
  await page.getByRole('button', { name: /^1:00 PM to / }).click()
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
  await expect(page.getByRole('button', { name: /^10:00 AM to / })).toHaveCount(0) // its own time isn't offered
  await page.getByRole('button', { name: /^5:15 PM to / }).click()
  // "That time isn't free any more" must never show, not even for a moment, once the move has gone through
  await page.evaluate(() => {
    const w = window as unknown as { flashed?: boolean }
    w.flashed = false
    new MutationObserver(() => {
      if (document.body.textContent?.includes("That time isn't free any more")) w.flashed = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  await page.getByRole('button', { name: 'Move to 5:15 PM' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  await expect(page.getByText(/5:15 PM/).first()).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { flashed?: boolean }).flashed)).toBe(false)
  expect(api.calls.find((c) => c.path.endsWith('/reschedule'))?.body).toEqual({ startAt: istInstant(tomorrow, '17:15') })
  // Free to cancel until 1 hour before the new start
  await expect(page.getByText('Free to cancel until')).toContainText('4:15 PM')

  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText('The salon will be told')).toBeVisible()
  await page.getByRole('button', { name: 'Yes, cancel it' }).click()
  await expect(page.getByText('Cancelled by you').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0)
})

test('cancelling within an hour warns that it counts as late; moving is not offered', async ({ page, context, api }) => {
  await signedIn(context, api)
  // Booked 20 minutes ago (past the 10 free minutes)
  api.bookings.push(api.makeBooking('b1', ['v1'], new Date(Date.now() + 30 * 60_000).toISOString(), new Date(Date.now() - 20 * 60_000).toISOString()))
  await page.goto('/bookings/b1')
  await expect(page.getByText("Bookings can't be moved within 1 hour of the start.")).toBeVisible()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText('this counts as a late cancel')).toBeVisible()
})

test('Pick a time leaves out times that clash with my own booking (the backend would refuse them)', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(tomorrow, '11:30')))   // 11:30–12:00
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByRole('button', { name: /^1:00 PM to / })).toBeVisible()
  await expect(page.getByRole('button', { name: /^11:30 AM to / })).toHaveCount(0)
})

test('a booking cancelled meanwhile: Move offers no times and goes back to the booking, which says so', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/bookings/b1')
  await page.getByRole('button', { name: 'Move to another time' }).click()
  await expect(page.getByRole('button', { name: /^1:00 PM to / })).toBeVisible()
  // The salon cancels it while the Move screen is open; the customer comes back to the app: the booking is read
  // again (canMove false) and the screen goes back to it. (Free times for it would now be 409 WRONG_STATUS: that is
  // the backend's, proven by BookIT.aBookingThatCantMoveAnyMoreHasNoFreeTimesToMoveTo.)
  Object.assign(api.booking('b1')!, { status: 'CANCELLED_BY_SALON', startCode: null, canChange: false, canMove: false })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  await expect(page.getByText('Cancelled by the salon')).toBeVisible()
  await expect(page.getByRole('button', { name: /^1:00 PM to / })).toHaveCount(0)
})

test('a time picked before my bookings arrived, that clashes with one: cleared, with "not free any more"', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  // My bookings' answer is slow; meanwhile I pick 11:30
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/me/bookings?when=upcoming', async (r) => {
    await held
    await r.fallback()
  })
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(tomorrow, '11:30')))   // 11:30–12:00, mine
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await expect(page.getByRole('button', { name: 'Continue with 11:30 AM' })).toBeVisible()
  // They arrive: 11:30 clashes with my own booking, so it goes, and so does the pick
  release()
  await expect(page.getByRole('button', { name: /^11:30 AM to / })).toHaveCount(0)
  await expect(page.getByText("That time isn't free any more. Pick another one.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with 11:30 AM' })).toHaveCount(0)
})
