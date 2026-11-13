import { expect, signedIn, test } from './helpers'
import type { BrowserContext } from '@playwright/test'
import { addDays, istInstant, todayIst, type MockApi } from './mockApi'

/** Signed in with a name but the email still pending (signed up after 2026-11-12). */
async function emailPending(context: BrowserContext, api: MockApi) {
  await signedIn(context, api)
  api.user = { ...api.user, email: null, emailVerified: false }
  const session = api.savedSession()
  // Once, like signedIn's own: a reload must keep what the app saved since (a refreshed token, a verified email)
  await context.addInitScript((s) => {
    if (localStorage.getItem('e2e.pending')) return
    localStorage.setItem('e2e.pending', '1')
    localStorage.setItem('ad.session', s)
  }, session)
}

test('with the email verified there is no banner and no detour', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  await expect(page.getByText('What do you need today?')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Email not verified' })).toBeHidden()
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'Need help' })).toBeVisible()
})

test('the banner opens the email screen; Back leaves it for later; verifying says it worked and the banner goes', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/')
  await page.getByRole('link', { name: 'Verify now' }).click()
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('link', { name: 'Verify now' })).toBeVisible()
  await page.getByRole('link', { name: 'Verify now' }).click()
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page.getByText('Email verified. Your account is secured.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Email not verified' })).toBeHidden()
})

test('Need help with the email pending: verify first, then the form, and what was typed is kept', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/profile')
  await expect(page.getByText('Not verified yet')).toBeVisible()
  await page.getByRole('link', { name: 'Write to support' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page).toHaveURL(/\/help$/)
  await page.getByLabel('Your message').fill('short')
  await expect(page.getByText('Tell us a little more (at least 10 characters).')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send to support' })).toBeDisabled()
  await page.getByLabel('Your message').fill('My booking SB12 shows cancelled but the salon says it is fine.')
  await page.reload()
  await expect(page.getByLabel('Your message')).toHaveValue('My booking SB12 shows cancelled but the salon says it is fine.')
  await page.getByRole('button', { name: 'Send to support' }).dblclick()
  await expect(page.getByRole('heading', { name: 'Sent: ticket CLZ-1001' })).toBeVisible()
  await expect(page.getByText('riya@example.com')).toBeVisible()
  expect(api.tickets).toHaveLength(1)
})

test('changing the name, adding a place or deleting the account wait for the email; a typed address too', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  for (const path of ['/places/new', '/salons/s1/confirm', '/help']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/verify-email$/)
  }
  // Browsing doesn't
  await page.goto('/salons/s1')
  await expect(page.getByText('Shine Unisex Salon')).toBeVisible()
  await page.goto('/bookings')
  await expect(page).toHaveURL(/\/bookings$/)
})

test('an old sign-up link to the email step goes to the email screen', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/welcome/email')
  await expect(page).toHaveURL(/\/verify-email$/)
})

test('deleting the account never asks for an email first', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/profile/delete')
  await expect(page).toHaveURL(/\/profile\/delete$/)
})

test('Back on the email screen forgets the detour: verifying later from Home goes Home, with a note', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/salons/s1')
  await page.goto('/places/new')
  await expect(page).toHaveURL(/\/verify-email$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await page.goto('/')
  await page.getByRole('link', { name: 'Verify now' }).click()
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Email verified. Your account is secured.')).toBeVisible()
})

test('a booking has a help link with its number filled in', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/bookings/b1')
  await page.getByRole('link', { name: 'Need help with this booking?' }).click()
  const no = String(api.bookings[0].bookingNo)
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue(`Booking ${no}`)
  await expect(page.getByLabel('Your message')).toHaveValue(`About my booking ${no}: `)
})

test('changing the mobile number never waits for the email: the second code goes to the number they have now', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/profile')
  await page.getByRole('link', { name: 'Change mobile number' }).click()
  await expect(page).toHaveURL(/\/profile\/phone$/)
  // Said before they start: the second code goes to the number they have now
  await expect(page.getByText(/We'll also send a code to your current number, \+91 98480 12345/)).toBeVisible()
  await page.getByLabel('New mobile number').fill('9700000004')
  await page.getByRole('button', { name: 'Send codes' }).click()
  await page.getByLabel('Code sent to the new number').fill('123456')
  await page.getByLabel(/Code sent to your current number/).fill('111222')
  await page.getByRole('button', { name: 'Change number' }).click()
  await expect(page.getByText(/Your mobile number is now \+91 97000 00004/)).toBeVisible()
  // Still no email: the banner stays
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Email not verified' })).toBeVisible()
})
