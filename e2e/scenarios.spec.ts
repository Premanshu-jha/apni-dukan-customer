import { addDays, istInstant, MockApi, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

/** Less common situations from docs/scenarios.md, each checked end to end. */

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
  await expect(page.getByText('Apni Dukan works only in India')).toBeVisible()
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
