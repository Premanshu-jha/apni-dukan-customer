import { addDays, istInstant, MockApi, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

/** Less common situations from docs/scenarios.md, each checked end to end. */

const many = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `x${String(i).padStart(2, '0')}`, name: `Salon ${i + 1}`, area: 'Sector 18', city: 'Noida',
  distanceKm: Math.round((50 + i * 40) / 100) / 10, photoUrl: null, distanceMetres: 50 + i * 40,
}))


test('booking refused because the profile is incomplete: finish the step, land back on Confirm, book', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.profileIncompleteOnce = true
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: '1:00 PM' }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/welcome\/name$/)
  await page.getByLabel('Your name').fill('Riya Sharma')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/salons\/s1\/confirm$/)
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1/)
})

test('a move that loses its new time: the notice, and that time is gone', async ({ page, context, api }) => {
  await signedIn(context, api)
  const tomorrow = addDays(todayIst(), 1)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(tomorrow, '10:00')))
  api.moveTakenOnce.add(istInstant(tomorrow, '17:15'))
  await page.goto('/bookings/b1/move')
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: '5:15 PM' }).click()
  await page.getByRole('button', { name: 'Move to 5:15 PM' }).click()
  await expect(page.getByText('Someone just booked that time')).toBeVisible()
  await expect(page.getByRole('button', { name: '5:15 PM' })).toHaveCount(0)
  // The free times asked for this move count the booking's own time as free
  expect(api.calls.some((c) => c.path.includes('/availability?') && c.path.includes('moving=b1'))).toBe(true)
})

test('a salon taken off the app while the customer looks at it', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salonGone = true
  await page.goto('/salons/s1')
  await expect(page.getByText('This salon is not on Apni Dukan right now.')).toBeVisible()
})

test('no salons nearby: the empty state with a way to tell us', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salons = []
  await page.goto('/')
  await expect(page.getByText('No salons near you yet')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Let us know' })).toHaveAttribute('href', /^mailto:support@example\.com/)
})

test('outside India: a clear message instead of "fields not valid"', async ({ page, context, api }) => {
  await signedIn(context, api, { location: false })
  await context.setGeolocation({ latitude: 51.5, longitude: -0.12, accuracy: 20 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Allow location' }).click()
  await expect(page.getByText('Clozest works only in India')).toBeVisible()
})

test('expired and too-many-tries sign-in codes say what to do', async ({ page, api }) => {
  void api // the fake backend answers sign-in
  await page.goto('/signin')
  await page.getByLabel('Mobile number').fill('9848012345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('999999')
  await expect(page.getByText('This code has expired. Ask for a new one.')).toBeVisible()
  await page.getByLabel('Code').fill('555555')
  await expect(page.getByText('Too many wrong tries. Ask for a new code.')).toBeVisible()
  await expect(page.getByLabel('Code')).toHaveValue('')
})

test('signing out in one tab signs out the other tab too', async ({ context, api }) => {
  await signedIn(context, api)
  const a = await context.newPage()
  await a.goto('/profile')
  const b = await context.newPage()
  await b.goto('/bookings')
  await expect(b.getByText('No upcoming bookings')).toBeVisible()
  await a.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(a).toHaveURL(/\/signin$/)
  await expect(b).toHaveURL(/\/signin$/)
  expect(api.user.name).toBe(MockApi.completeUser().name)
})

test('a dense area: 30 salons a page, nearest first, then "Show more salons" loads the rest', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salons = many(45)
  await page.goto('/')
  await expect(page.getByText('Salons within 2 km, nearest first')).toBeVisible()
  await expect(page.getByRole('link', { name: /Salon \d+/ })).toHaveCount(30)
  await page.getByRole('button', { name: 'Show more salons' }).click()
  await expect(page.getByRole('link', { name: /Salon \d+/ })).toHaveCount(45)
  await expect(page.getByText('45 salons within 2 km, nearest first')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more salons' })).toBeHidden()
  // The second page asked from where the first ended
  const second = api.calls.find((c) => c.path.startsWith('/api/v1/salons?') && c.path.includes('afterId=x29'))
  expect(second?.path).toContain('afterDistance=1210')
})

test('"Show more salons" failing keeps the salons already shown and says so; tapping again works', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salons = many(40)
  api.failSalonPages = 3   // the first try and both automatic retries
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Salon \d+/ })).toHaveCount(30)
  await page.getByRole('button', { name: 'Show more salons' }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't load more salons")
  await expect(page.getByRole('link', { name: /Salon \d+/ })).toHaveCount(30)   // still there
  await page.getByRole('button', { name: 'Show more salons' }).click()
  await expect(page.getByRole('link', { name: /Salon \d+/ })).toHaveCount(40)
  await expect(page.getByRole('link', { name: 'Salon 31' })).toBeFocused()   // keyboard users land on the new ones
})

test('exactly 30 salons: one more (empty) page, then the count and no button', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salons = many(30)
  await page.goto('/')
  await page.getByRole('button', { name: 'Show more salons' }).click()
  await expect(page.getByText('30 salons within 2 km, nearest first')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more salons' })).toBeHidden()
})

test('more than 99 unread messages say "99+" (the backend counts up to 100)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.inbox = Array.from({ length: 120 }, (_, i) => ({ id: `n${i}`, type: 'BOOKING_CONFIRMED', title: 'Booked', body: 'x', url: null, sentAt: new Date().toISOString(), read: false }))
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Messages, more than 99 unread' })).toBeVisible()
  await page.getByRole('link', { name: 'Messages, more than 99 unread' }).click()
  await expect(page.getByText('99+ unread')).toBeVisible()
})

test('a refresh answered 304 (nothing changed) keeps the booking on screen', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/bookings/b1')
  await expect(page.getByRole('button', { name: 'Move to another time' })).toBeVisible()
  // Coming back to the app re-reads the booking, sending the ETag it got: the backend answers 304 with no body
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.notModified).toContain('/api/v1/bookings/b1')
  await expect(page.getByRole('button', { name: 'Move to another time' })).toBeVisible()
  await expect(page.getByText(/10:00 AM/).first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
