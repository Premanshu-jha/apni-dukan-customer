import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { addDays, istInstant, MockApi, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

/** A text of the app in a language, from its own files (so a wording change doesn't break the test). */
function text(lang: string, key: string): string {
  const [area, name] = key.split('.')
  return (JSON.parse(readFileSync(join(process.cwd(), 'src/i18n', lang, `${area}.json`), 'utf8')) as Record<string, string>)[name]
}

const languagePatches = (api: MockApi) =>
  api.calls
    .filter((c) => c.method === 'PATCH' && c.path === '/api/v1/auth/me')
    .map((c) => (c.body as { language?: string } | null)?.language)
    .filter((l) => l !== undefined)

/** PATCH /auth/me from the page with the session's token, as the app sends it: the status and the answer's body. */
async function patchMe(page: Page, api: MockApi, body: unknown) {
  const token = [...api['accessValid']].at(-1) ?? ''
  return page.evaluate(
    async ({ url, body, token }) => {
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      return { status: r.status, body: (await r.json()) as { code?: string; details?: Record<string, string>; language?: string | null } }
    },
    { url: 'http://api.test/api/v1/auth/me', body, token },
  )
}

/** The sign-in screen to Home, in whatever language shows (the fields found by their ids). */
async function signInFromScreen(page: Page, lang: string) {
  await page.locator('#phone').fill('98480 12345')
  await page.getByRole('button', { name: text(lang, 'auth.sendCode') }).click()
  await page.locator('#code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
}

test('the fake backend answers PATCH /auth/me as AuthController.updateMe does', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  const empty = await patchMe(page, api, {})
  expect([empty.status, empty.body.code, Object.keys(empty.body.details!)]).toEqual([400, 'VALIDATION_FAILED', ['name']])
  const set = await patchMe(page, api, { language: 'kn' })
  expect([set.status, set.body.language]).toEqual([200, 'kn'])
  const cleared = await patchMe(page, api, { language: null })
  expect([cleared.status, cleared.body.language]).toEqual([200, null])
  const bad = await patchMe(page, api, { language: 'fr' })
  expect([bad.status, Object.keys(bad.body.details!)]).toEqual([400, ['language']])
  // Both wrong: only the name is reported (the size check comes first), and nothing is saved
  const both = await patchMe(page, api, { name: 'R', language: 'fr' })
  expect([both.status, Object.keys(both.body.details!)]).toEqual([400, ['name']])
  expect(api.user.name).toBe('Riya Sharma')
})

test.describe('a phone set to Tamil', () => {
  test.use({ locale: 'ta-IN' })

  test('the first screen asks in Tamil with Tamil first and marked; one tap: kept on the phone (offline page) and saved on the account', async ({ page, api }) => {
    api.user = MockApi.completeUser()
    await page.goto('/signin')
    await expect(page).toHaveURL(/\/language$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('உங்கள் மொழியைத் தேர்ந்தெடுங்கள்')
    const first = page.getByRole('group').getByRole('button').first()
    await expect(first).toHaveAccessibleName('தமிழ், Tamil')
    await first.click()
    await signInFromScreen(page, 'ta')
    await expect.poll(() => languagePatches(api)).toEqual(['ta'])
    expect(await page.evaluate(() => localStorage.getItem('language'))).toBe('ta')
    await page.goto('/offline.html')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta')
  })

  test('picked on a new phone\'s first screen, the language is the phone\'s: an account with its own keeps it, nothing sent', async ({ page, api }) => {
    api.user = { ...MockApi.completeUser(), language: 'kn' }
    await page.goto('/signin')
    await page.getByRole('button', { name: /^தமிழ்/ }).click()
    await signInFromScreen(page, 'ta')
    // Someone may have set the phone up for them: the account's own language comes back
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn')
    await page.waitForTimeout(300)
    expect(languagePatches(api)).toEqual([])
  })

  test('a phone with a language chosen before: the account\'s own language (from another phone) wins, and nothing is sent', async ({ page, context, api }) => {
    await context.addInitScript(() => {
      if (!localStorage.getItem('language')) localStorage.setItem('language', 'ta')
    })
    api.user = { ...MockApi.completeUser(), language: 'kn' }
    await page.goto('/signin')
    await signInFromScreen(page, 'ta')
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn')
    await expect(page.getByRole('link', { name: text('kn', 'app.tabHome') })).toBeVisible()
    await page.waitForTimeout(300)
    expect(languagePatches(api)).toEqual([])
  })
})

test('Profile has a language button at the top; a choice is confirmed in the new language, saying where to change it', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Language: English' }).click()
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'ಕನ್ನಡ' }).click()
  await expect(page.getByRole('status').filter({ hasText: text('kn', 'language.changedToast') })).toBeVisible()
  await expect(page.getByRole('button', { name: text('kn', 'language.button').replace('{name}', 'ಕನ್ನಡ') })).toBeVisible()
})

test('booking cards show the services\' pictures; an old English message title shows in the reader\'s language', async ({ page, context, api }) => {
  await signedIn(context, api)
  await context.addInitScript(() => localStorage.setItem('language', 'hi'))
  api.bookings.push(api.makeBooking('b1', ['v1', 'v2'], istInstant(addDays(todayIst(), 2), '11:00')))
  api.inbox.unshift({ id: 'n1', type: 'BOOKING_CONFIRMED', title: 'Booked at Shine Unisex Salon', body: 'Sat 22 Nov, 11:00 AM.', url: '/bookings/b1', sentAt: new Date().toISOString(), read: false })
  await page.goto('/')
  await expect(page.getByTestId('booking-service-icons').first().locator('svg')).toHaveCount(2)
  await page.goto('/bookings')
  await expect(page.getByTestId('booking-service-icons').first().locator('svg')).toHaveCount(2)
  await page.goto('/notifications')
  await expect(page.getByText(text('hi', 'notifications.typeBOOKING_CONFIRMED'))).toBeVisible()
  await expect(page.getByText('Booked at Shine Unisex Salon')).toHaveCount(0)
})

test('the About page\'s way in is in the reader\'s language', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('language', 'te'))
  await page.goto('/about')
  await expect(page.getByRole('link', { name: text('te', 'legal.signInOrUp') })).toBeVisible()
})
