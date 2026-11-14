import { addDays, istInstant, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

/** "Tell me if an earlier time opens", and free times that refresh on their own (docs/scenarios.md, 176–203). */

test('booking with the switch on sends it, and the booking page shows it on and can turn it off', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^5:15 PM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByText('more than 10 minutes late')).toBeVisible()
  const onConfirm = page.getByRole('switch', { name: 'Tell me if an earlier time opens' })
  await expect(onConfirm).toHaveAttribute('aria-checked', 'false')
  await onConfirm.click()
  await expect(onConfirm).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Book now' }).click()

  await expect(page).toHaveURL(/\/bookings\/b1/)
  expect(api.calls.find((c) => c.path === '/api/v1/bookings')?.body).toMatchObject({ earlierAlert: true })
  const onBooking = page.getByRole('switch', { name: 'Tell me if an earlier time opens' })
  await expect(onBooking).toHaveAttribute('aria-checked', 'true')
  await onBooking.click()
  await expect(onBooking).toHaveAttribute('aria-checked', 'false')
  expect(api.calls.find((c) => c.path.endsWith('/earlier-alert'))?.body).toEqual({ on: false })
  expect(api.booking('b1')?.earlierAlert).toBe(false)
})

test('booking without touching the switch leaves it off', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^1:00 PM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1/)
  // Off is sent as nothing at all (a backend from before V33 refuses unknown fields)
  expect(api.calls.find((c) => c.path === '/api/v1/bookings')?.body).not.toHaveProperty('earlierAlert')
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toHaveAttribute('aria-checked', 'false')
})

test('the earlier-time message moves the booking in one tap', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.bookings.push({ ...api.makeBooking('b1', ['v1'], istInstant(tomorrow, '17:15')), earlierAlert: true })
  const offered = istInstant(tomorrow, '11:30')
  api.inbox.unshift({ id: 'n1', type: 'BOOKING_EARLIER_SLOT', title: 'Earlier time at Shine Unisex Salon', body: '11:30 AM with Raju just opened up.', url: `/bookings/b1?earlier=${offered}`, sentAt: new Date().toISOString(), read: false })

  await page.goto('/notifications')
  await page.getByText('Earlier time at Shine Unisex Salon').click()
  await expect(page).toHaveURL(/\/bookings\/b1\?earlier=/)
  await expect(page.getByText(/An earlier time opened: .*11:30 AM/)).toBeVisible()
  await page.getByRole('button', { name: 'Move to 11:30 AM' }).click()

  await expect(page.getByText(/Moved to .*11:30 AM/)).toBeVisible()
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  expect(api.calls.find((c) => c.path.endsWith('/reschedule'))?.body).toEqual({ startAt: offered })
  await expect(page.getByText('An earlier time opened')).toHaveCount(0)
  // Its switch stays on after the move
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toHaveAttribute('aria-checked', 'true')
})

test('someone else took the earlier time first: the customer is told and can see other times', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(tomorrow, '17:15')))
  const offered = istInstant(tomorrow, '11:30')
  api.moveTakenOnce.add(offered)

  await page.goto(`/bookings/b1?earlier=${offered}`)
  await page.getByRole('button', { name: 'Move to 11:30 AM' }).click()
  await expect(page.getByText('Someone else took 11:30 AM first.')).toBeVisible()
  await expect(page.getByText(/5:15 PM/).first()).toBeVisible()   // the booking stays where it was
  await page.getByRole('button', { name: 'See other times' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1\/move$/)
})

test('an earlier-time link for a booking that can no longer move, or already moved, offers nothing', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.bookings.push(api.makeBooking('b1', ['v1'], new Date(Date.now() + 40 * 60_000).toISOString()))
  await page.goto(`/bookings/b1?earlier=${new Date(Date.now() - 60 * 60_000).toISOString()}`)
  await expect(page.getByText(/This booking can't be moved any more, so it stays at/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Move to/ })).toHaveCount(0)
  // Less than an hour to go: no switch either (nothing could be offered)
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toHaveCount(0)

  // Already at (or before) the offered time: the card doesn't show; a broken link is ignored
  api.bookings.push(api.makeBooking('b2', ['v1'], istInstant(tomorrow, '11:30')))
  await page.goto(`/bookings/b2?earlier=${istInstant(tomorrow, '11:30')}`)
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toBeVisible()
  await expect(page.getByText('An earlier time opened')).toHaveCount(0)
  await page.goto('/bookings/b2?earlier=not-a-time')
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toBeVisible()
  await expect(page.getByText('An earlier time opened')).toHaveCount(0)
})

test('a time someone else takes disappears from the list on its own, without a reload', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.clock.install()
  const tomorrow = addDays(todayIst(), 1)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByRole('button', { name: /^1:00 PM to / })).toBeVisible()

  api.gone.add(istInstant(tomorrow, '13:00'))
  await page.clock.runFor(31_000)
  await expect(page.getByRole('button', { name: /^1:00 PM to / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^11:30 AM to / })).toBeVisible()
})

test('a message arriving while the times are open refreshes them at once', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByRole('button', { name: /^5:15 PM to / })).toBeVisible()

  api.gone.add(istInstant(tomorrow, '17:15'))
  // What the service worker posts to open windows when a push arrives (public/sw.js)
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { kind: 'push' } })))
  await expect(page.getByRole('button', { name: /^5:15 PM to / })).toHaveCount(0)
})

test('the switch stays on when the picked time was taken and another is picked', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.takenOnce.add(istInstant(tomorrow, '11:30'))
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('switch', { name: 'Tell me if an earlier time opens' }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page.getByText('Someone just booked that time')).toBeVisible()

  await page.getByRole('button', { name: /^5:15 PM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1/)
  expect(api.calls.filter((c) => c.path === '/api/v1/bookings').at(-1)?.body).toMatchObject({ earlierAlert: true })
})

test('a booking within the hour gets no switch on Confirm (it could never move)', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.clock.install({ time: new Date(istInstant(todayIst(), '12:30')) })
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Today' }).click()
  await page.getByRole('button', { name: /^1:00 PM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByRole('button', { name: 'Book now' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toHaveCount(0)
})

test('the picked time taken by someone else while on screen is cleared, with the reason', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.clock.install()
  const tomorrow = addDays(todayIst(), 1)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^1:00 PM to / }).click()
  await expect(page.getByRole('button', { name: 'Continue with 1:00 PM' })).toBeEnabled()

  api.gone.add(istInstant(tomorrow, '13:00'))
  await page.clock.runFor(31_000)
  await expect(page.getByText("That time isn't free any more")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pick a time' })).toBeDisabled()
  // Picking another time, then another day, doesn't bring the note back
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await expect(page.getByText("That time isn't free any more")).toHaveCount(0)
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(page.getByText("That time isn't free any more")).toHaveCount(0)
})

test('a refresh that fails keeps the times on screen, with a note', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.clock.install()
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^1:00 PM to / }).click()

  api.failSlotsOnce = true
  await page.clock.runFor(31_000)
  await expect(page.getByText("Couldn't check the times again just now")).toBeVisible()
  await expect(page.getByRole('button', { name: /^1:00 PM to / })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with 1:00 PM' })).toBeEnabled()
})

test('an offer whose time has passed, or is now too soon, says so instead of failing', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(tomorrow, '17:15')))

  await page.goto(`/bookings/b1?earlier=${new Date(Date.now() - 10 * 60_000).toISOString()}`)
  await expect(page.getByText('This time has passed.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Move to \d/ })).toHaveCount(0)

  // 10 minutes from now: inside the salon's 30-minute notice, so the backend refuses it
  const soon = new Date(Math.ceil((Date.now() + 10 * 60_000) / 60_000) * 60_000).toISOString()
  await page.goto(`/bookings/b1?earlier=${soon}`)
  await page.getByRole('button', { name: /^Move to \d/ }).click()
  await expect(page.getByText(/is too soon to book now\. Your booking stays at 5:15 PM\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'See other times' })).toBeVisible()
})
