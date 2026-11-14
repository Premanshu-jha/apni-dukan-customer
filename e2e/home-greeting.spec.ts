import type { BrowserContext } from '@playwright/test'
import { expect, signedIn, test } from './helpers'
import { addDays, istInstant, todayIst, type MockApi } from './mockApi'

/** Signed in with the email still pending (as email-later.spec does). */
async function emailPending(context: BrowserContext, api: MockApi) {
  await signedIn(context, api)
  api.user = { ...api.user, email: null, emailVerified: false }
  const session = api.savedSession()
  await context.addInitScript((s) => {
    if (localStorage.getItem('e2e.pending')) return
    localStorage.setItem('e2e.pending', '1')
    localStorage.setItem('ad.session', s)
  }, session)
}

for (const [at, words] of [
  ['09:00', 'Good morning, Riya'],
  ['14:30', 'Good afternoon, Riya'],
  ['19:45', 'Good evening, Riya'],
] as const) {
  test(`Home greets by the time of day in India: ${words} at ${at}`, async ({ page, context, api }) => {
    await page.clock.setFixedTime(new Date(istInstant(todayIst(), at)))
    await signedIn(context, api)
    await page.goto('/')
    await expect(page.getByText(words, { exact: true })).toBeVisible()
    await expect(page.getByText('What do you need today?')).toBeVisible()
  })
}

test('a first-time customer sees no booking card and no Book again', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  await expect(page.getByText('Shine Unisex Salon').first()).toBeVisible()   // the salon list
  await expect(page.getByRole('heading', { name: 'Your booking' })).toHaveCount(0)
  await expect(page.getByText('Want to book again?')).toHaveCount(0)
})

test('coming back after booking: the booking with its details, then Book now opens the salon with those services ticked', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  const b = api.makeBooking('b1', ['v1', 'v2'], istInstant(tomorrow, '11:30'))
  api.bookings.push(b)
  await page.goto('/')
  const card = page.getByRole('link', { name: /Shine Unisex Salon.*11:30 AM/ })
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible()
  await expect(card).toContainText('Tomorrow, 11:30 AM to 12:15 PM')
  await expect(card).toContainText('Haircut, Beard trim')
  await expect(card).toContainText('Booked')
  await expect(card).toContainText(`Code to show at the salon: ${b.startCode as string}`)
  await expect(page.getByText('See all')).toHaveCount(0)
  // The card opens the booking
  await card.click()
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  await page.goBack()
  // Book now: the same salon, the same two services picked, straight on to Pick a time
  await expect(page.getByText('Want to book again?')).toBeVisible()
  await page.getByRole('link', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/salons\/s1$/)
  await expect(page.getByLabel(/Haircut/)).toBeChecked()
  await expect(page.getByLabel(/Beard trim/)).toBeChecked()
  await expect(page.getByLabel(/Hair colour/)).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Pick a time' })).toBeEnabled()
})

test('two bookings coming up (the most allowed): the soonest is shown, a link to both, and no Book now', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b2', ['v3'], istInstant(addDays(todayIst(), 3), '17:15')))
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Shine Unisex Salon.*Tomorrow, 10:00 AM to 10:30 AM/ })).toBeVisible()
  await expect(page.getByText('Want to book again?')).toHaveCount(0)   // a third would be refused
  await page.getByRole('link', { name: 'See all 2 bookings' }).click()
  await expect(page).toHaveURL(/\/bookings$/)
})

test('nothing coming up but a past visit: no booking card, Book now repeats the last visit', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.completedVisit('b9')
  await page.goto('/')
  await expect(page.getByText('Want to book again?')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your booking' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Book now' }).click()
  await expect(page.getByLabel(/Haircut/)).toBeChecked()
})

test('only a cancelled booking before: Book again still offers that salon and those services', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push({ ...api.makeBooking('b3', ['v2'], istInstant(addDays(todayIst(), 2), '12:00')), status: 'CANCELLED_BY_CUSTOMER', startCode: null })
  await page.goto('/')
  await expect(page.getByText('Want to book again?')).toBeVisible()
  await page.getByRole('link', { name: 'Book now' }).click()
  await expect(page.getByLabel(/Beard trim/)).toBeChecked()
})

test("the last visit's salon is no longer on the app: no Book now that leads nowhere", async ({ page, context, api }) => {
  await signedIn(context, api)
  api.completedVisit('b9')
  await page.route('**/api/v1/salons/s1', (r) =>
    r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'SALON_NOT_FOUND', message: 'No such salon.' }) }),
  )
  await page.goto('/')
  await expect(page.getByText('Shine Unisex Salon').first()).toBeVisible()
  await expect(page.getByText('Want to book again?')).toHaveCount(0)
})

test('while the upcoming list is still loading, an old visit is never offered in place of the next booking', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.completedVisit('b9')
  api.bookings.push(api.makeBooking('b1', ['v2'], istInstant(addDays(todayIst(), 1), '10:00')))
  // The upcoming answer slow from the start; past bookings already seen in My bookings, then Home
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/me/bookings?when=upcoming', async (r) => {
    await held
    await r.fallback()
  })
  await page.goto('/bookings')
  await page.getByRole('button', { name: 'Past' }).click()
  await expect(page.getByText('Haircut').first()).toBeVisible()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
  await expect(page.getByText('Want to book again?')).toHaveCount(0)
  release()
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible()
  await expect(page.getByText('Shine Unisex Salon · Beard trim · another time')).toBeVisible()
})

test('Home left open since the morning greets by the time it is picked up again', async ({ page, context, api }) => {
  await page.clock.setFixedTime(new Date(istInstant(todayIst(), '11:55')))
  await signedIn(context, api)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Good morning, Riya' })).toBeVisible()
  await page.clock.setFixedTime(new Date(istInstant(todayIst(), '18:05')))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Good evening, Riya' })).toBeVisible()
})

test("Move shows the end from the booking's own length, whatever the salon's services take now", async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  const b = api.makeBooking('b1', ['v1'], istInstant(tomorrow, '10:00'))
  // Booked when a haircut took 45 minutes; it takes 30 now
  b.endsAt = new Date(Date.parse(b.startsAt as string) + 45 * 60_000).toISOString()
  api.bookings.push(b)
  await page.goto('/bookings/b1')
  await page.getByRole('button', { name: 'Move to another time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByRole('button', { name: /^5:15 PM to 6:00 PM$/ })).toBeVisible()
})

test('bookings that cannot be read leave Home as it was', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.route('**/api/v1/me/bookings**', (r) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' }) }),
  )
  await page.goto('/')
  await expect(page.getByText('What do you need today?')).toBeVisible()
  await expect(page.getByText('Shine Unisex Salon').first()).toBeVisible()
  await expect(page.getByText('Want to book again?')).toHaveCount(0)
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
})

test('Pick a time shows when each visit would end, from the services picked', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByLabel(/Beard trim/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByRole('button', { name: /^1:00 PM to 1:45 PM$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^11:30 AM to 12:15 PM$/ })).toBeVisible()
})

test('sent to verify the email from a booking: it says why, and goes back to the booking', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText('One step before you book.')).toBeVisible()
  await expect(page.getByText('with what you picked still there', { exact: false })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page).toHaveURL(/\/salons\/s1\/book$/)
  await expect(page.getByText('Shine Unisex Salon · about 30 min')).toBeVisible()   // Haircut still picked
})

test('opened from the Home banner, the email screen says nothing about a booking', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/')
  await page.getByRole('link', { name: 'Verify now' }).click()
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
  await expect(page.getByText('One step before you book.')).toHaveCount(0)
})

test('one booking in the chair and one coming up: Book now is still offered (only bookings not started count)', async ({ page, context, api }) => {
  await signedIn(context, api)
  const now = new Date(Date.now() - 10 * 60_000).toISOString()
  api.bookings.push({ ...api.makeBooking('b1', ['v3'], now), status: 'IN_SERVICE', startCode: null })
  api.bookings.push(api.makeBooking('b2', ['v1'], istInstant(addDays(todayIst(), 2), '10:00')))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible()
  await expect(page.getByText('See all 2 bookings')).toBeVisible()
  await expect(page.getByText('Want to book again?')).toBeVisible()
  // And a third booking really goes through (the fake backend applies the same limit as the real one)
  await page.getByRole('link', { name: 'Book now' }).click()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^1:00 PM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b3/)
})

test('at two bookings not started yet, a third is refused: Home hides Book now for that reason', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  api.bookings.push(api.makeBooking('b2', ['v2'], istInstant(addDays(todayIst(), 2), '10:00')))
  // Reached anyway (a typed address): the booking is refused with the backend's reason
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^5:15 PM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page.getByText('You already have 2 upcoming bookings.', { exact: false })).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('See all 2 bookings')).toBeVisible()
  await expect(page.getByText('Want to book again?')).toHaveCount(0)
})

for (const [what, answer] of [
  ['offline', null],
  ['too many requests (429)', { status: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Try again in a minute.' }],
] as const) {
  test(`bookings unreadable (${what}): Home stays as it was, with no error`, async ({ page, context, api }) => {
    await signedIn(context, api)
    api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
    await page.route('**/api/v1/me/bookings**', (r) =>
      answer === null
        ? r.abort('internetdisconnected')
        : r.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify({ code: answer.code, message: answer.message }) }),
    )
    await page.goto('/')
    await expect(page.getByText('What do you need today?')).toBeVisible()
    await expect(page.getByText('Shine Unisex Salon').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your booking' })).toHaveCount(0)
    await expect(page.getByText('Want to book again?')).toHaveCount(0)
    await expect(page.getByText(/Too many requests|offline|Something went wrong/)).toHaveCount(0)
  })
}

test('the salon cancels while Home is open: on coming back to the app the card goes, and Book again offers that visit', async ({ page, context, api }) => {
  await page.clock.install()
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v2'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible()
  // The salon cancels it; the app comes back to the front after a while (Home reads at most every 30 s)
  Object.assign(api.booking('b1')!, { status: 'CANCELLED_BY_SALON', startCode: null, canChange: false, canMove: false })
  await page.clock.fastForward(31_000)
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('heading', { name: 'Your booking' })).toHaveCount(0)
  await expect(page.getByText('Want to book again?')).toBeVisible()
  await expect(page.getByText('Shine Unisex Salon · Beard trim')).toBeVisible()
})

test('sent to verify the email from Confirm: the same note, and back to the booking after', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.goto('/salons/s1/confirm')
  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText('One step before you book.')).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  // Back into the booking: Confirm with no time yet goes on to the salon, what was picked still ticked
  await expect(page).toHaveURL(/\/salons\/s1(\/confirm|\/book)?$/)
  await expect(page.getByLabel(/Haircut/)).toBeChecked()
})
