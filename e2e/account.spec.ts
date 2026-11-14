import { expect, signedIn, test } from './helpers'

test('messages: the bell shows unread, opening one marks it read and opens its booking', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], new Date(Date.now() + 26 * 3600_000).toISOString()))
  api.inbox.push(
    { id: 'n2', type: 'BOOKING_REMINDER', title: 'Your booking is in 1 hour', body: 'Shine Unisex Salon at 4:30 PM', url: '/bookings/b1', sentAt: new Date().toISOString(), read: false },
    { id: 'n1', type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', body: 'Shine Unisex Salon', url: 'https://evil.example/x', sentAt: new Date(Date.now() - 86400_000).toISOString(), read: true },
  )
  await page.goto('/')
  await expect(page.getByLabel('Messages, 1 unread').getByText('1', { exact: true })).toHaveClass(/bg-accent/)
  await page.getByLabel('Messages, 1 unread').click()
  await page.getByText('Your booking is in 1 hour').click()
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  // Sent as it opens (the request may reach the fake backend just after the page has changed: wait for it)
  await expect.poll(() => api.calls.find((c) => c.path.includes('/me/notifications/read'))?.body).toEqual({ ids: ['n2'] })

  // A message whose link points to another site opens nothing
  await page.goto('/notifications')
  await page.getByText('Booking confirmed').click()
  await expect(page).toHaveURL(/\/notifications$/)
})

test('signing out ends the session and the next person starts at Home', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/bookings')
  // Let the start-up refresh finish first: leaving the page while it is on its way loses its answer, and the next
  // page would send the refresh token the backend already swapped (401: signed out, as on a real phone)
  await expect(page.getByText('No upcoming bookings')).toBeVisible()
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  expect(await page.evaluate(() => localStorage.getItem('ad.session'))).toBeNull()
  expect(api.calls.some((c) => c.path.endsWith('/auth/logout'))).toBe(true)

  // The sign-in screen may still be settling after the sign-out redirect: type until it sticks
  await expect(async () => {
    await page.getByLabel('Mobile number').fill('9848012345')
    await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled({ timeout: 500 })
  }).toPass()
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
})

test('a second tab never sends an already-swapped refresh token', async ({ context, api }) => {
  await signedIn(context, api)
  const a = await context.newPage()
  await a.goto('/bookings')
  await expect(a.getByText('No upcoming bookings')).toBeVisible()
  const b = await context.newPage()
  await b.goto('/profile')
  await expect(b.getByText('Riya Sharma')).toBeVisible()
  await a.reload()
  await expect(a.getByText('No upcoming bookings')).toBeVisible()
  // Each tab refreshed with the newest token: the backend never saw a swapped one come back (not even once in the
  // grace for a reloaded tab, which would hide a tab sending an old token)
  expect(api.reused).toBe(0)
  expect(api.graceUsed).toBe(0)
  await expect(a).toHaveURL(/\/bookings$/)
  await expect(b).toHaveURL(/\/profile$/)
})

test('if "sign out everywhere" fails, this device stays signed in and says so', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.failLogoutAll = true
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Sign out on all devices' }).click()
  await page.getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect(page.getByText('Your other devices are still signed in.')).toBeVisible()
  await expect(page).toHaveURL(/\/profile$/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a salon service that was removed is dropped from a saved draft', async ({ page, context, api }) => {
  await signedIn(context, api)
  await context.addInitScript(() =>
    localStorage.setItem('ad.draft', JSON.stringify({ salonId: 's1', serviceIds: ['gone', 'v1'], date: null, startAt: null, idempotencyKey: 'k' })),
  )
  await page.goto('/salons/s1')
  await expect(page.getByText('1 service · ₹200')).toBeVisible()
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ad.draft')))!).serviceIds).toEqual(['v1'])
})
