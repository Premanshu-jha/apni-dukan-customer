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

test('Need help with the email pending: it says why on the page, Call and WhatsApp stay, then verify and the form opens', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/profile')
  await expect(page.getByText('Not verified yet')).toBeVisible()
  await page.getByRole('link', { name: 'Write to support' }).click()
  // Not sent away to the email screen: Need help says what writing needs, with a person one tap away
  await expect(page).toHaveURL(/\/help\?write=1$/)
  await expect(page.getByRole('heading', { name: 'Verify your email to write here' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' }).first()).toHaveAttribute('href', 'tel:+919381251613')
  await expect(page.getByRole('link', { name: 'WhatsApp us' }).first()).toHaveAttribute('href', /^https:\/\/wa\.me\/919381251613\?text=/)
  await page.getByRole('button', { name: 'Verify my email' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText('One step before you write to us.')).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page).toHaveURL(/\/help\?write=1$/)
  await expect(page.getByLabel('Your message')).toBeVisible()
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

test('changing the name and booking wait for the email; saving a place and Need help do not', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByText('One step before you change your name.')).toBeVisible()
  await page.goto('/salons/s1/confirm')
  await expect(page).toHaveURL(/\/verify-email$/)
  // A place can be saved without an email (browsing salons near an address works from the first day)
  await page.goto('/places/new')
  await expect(page).toHaveURL(/\/places\/new$/)
  await expect(page.getByLabel('Area')).toBeVisible()
  // Need help's answers don't wait either; Write to us says on the page what it needs (no loop to the email screen)
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'How do I…?' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^My requests/ })).toBeHidden()
  await page.getByRole('button', { name: 'Write to us' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByRole('heading', { name: 'Verify your email to write here' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Call us' }).first()).toBeVisible()
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
  await page.goto('/salons/s1/confirm')
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
