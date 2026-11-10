import { addDays, istInstant, todayIst } from './mockApi'
import { expect, test } from './helpers'

test('a new customer signs up (phone, email, name last), finds a salon and books', async ({ page, api }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)

  await page.getByLabel('Mobile number').fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page).toHaveURL(/\/signin\/code$/)
  expect(api.calls.find((c) => c.path.endsWith('/otp/send'))?.body).toMatchObject({ phone: '9848012345' })

  await page.getByLabel('Code').fill('111111')
  await expect(page.getByText('That code is not right')).toBeVisible()
  await page.getByLabel('Code').fill('123456')

  await expect(page).toHaveURL(/\/welcome\/email$/)
  await page.getByLabel('Email').fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')

  await expect(page).toHaveURL(/\/welcome\/name$/)
  await page.getByLabel('Your name').fill('Riya Sharma')
  await page.getByRole('button', { name: 'Done' }).click()

  await expect(page).toHaveURL(/\/$/)
  // The same radius as the list and the backend (2 km), not the old "5 km"
  await expect(page.getByText('Clozest needs your location to show salons within 2 km.')).toBeVisible()
  await page.getByRole('button', { name: 'Allow location' }).click()
  await page.getByText('Shine Unisex Salon').click()

  await page.getByLabel(/Haircut/).check()
  await page.getByLabel(/Beard trim/).check()
  await expect(page.getByText('2 services · ₹300')).toBeVisible()
  await page.getByRole('button', { name: 'Pick a time' }).click()

  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: '3:45 PM' }).click()
  await page.getByRole('button', { name: 'Continue with 3:45 PM' }).click()
  await page.getByRole('button', { name: 'Book now' }).click()

  await expect(page).toHaveURL(/\/bookings\/b1\?new=1$/)
  await expect(page.getByText("You're booked!")).toBeVisible()
  await expect(page.getByLabel('Start code 4 8 2 1')).toBeVisible()

  const book = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/bookings')!
  expect(book.body).toEqual({ salonId: 's1', serviceIds: ['v1', 'v2'], startAt: istInstant(addDays(todayIst(), 1), '15:45') })
  expect(book.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)

  await page.goto('/bookings')
  await expect(page.getByText('Shine Unisex Salon')).toBeVisible()
})

test('blocked location shows the guide, not an empty list', async ({ page, context, api }) => {
  await context.clearPermissions()
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, bad) =>
      bad?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError)
  })
  api.user = (await import('./mockApi')).MockApi.completeUser()
  await page.addInitScript((s) => localStorage.setItem('ad.session', s), api.savedSession())
  await page.goto('/')
  await page.getByRole('button', { name: 'Allow location' }).click()
  await expect(page.getByText('Location is turned off')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(api.calls.some((c) => c.path.startsWith('/api/v1/salons?'))).toBe(false)
})
