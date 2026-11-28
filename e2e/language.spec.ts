import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MockApi } from './mockApi'
import { expect, signedIn, test } from './helpers'
import type { Page } from '@playwright/test'

/** A text of the app in a language, from its own files (so a wording change doesn't break the test). */
function text(lang: string, key: string): string {
  const [area, name] = key.split('.')
  return (JSON.parse(readFileSync(join(process.cwd(), 'src/i18n', lang, `${area}.json`), 'utf8')) as Record<string, string>)[name]
}

const languagePatches = (api: MockApi) =>
  api.calls.filter((c) => c.method === 'PATCH' && c.path === '/api/v1/auth/me' && (c.body as { language?: string }).language !== undefined)

/** The sign-in screen to Home, in whatever language shows (the fields found by their ids). */
async function signInFromScreen(page: Page, lang: string) {
  await page.locator('#phone').fill('98480 12345')
  await page.getByRole('button', { name: text(lang, 'auth.sendCode') }).click()
  await page.locator('#code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
}

test('pick Hindi on sign-in, see Home in Hindi (saved on the account), then change it in Profile', async ({ page, api }) => {
  api.user = MockApi.completeUser()
  await page.goto('/signin')
  await page.getByRole('button', { name: 'हिन्दी' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await expect(page.getByLabel(text('hi', 'auth.phoneLabel'))).toBeVisible()
  await signInFromScreen(page, 'hi')

  await expect(page.getByRole('link', { name: text('hi', 'app.tabHome') })).toBeVisible()
  await expect(page.getByText(text('hi', 'home.subtitle'))).toBeVisible()
  // Saved on the account once, the language only (the name and the rest stay)
  await expect.poll(() => languagePatches(api).map((c) => c.body)).toEqual([{ language: 'hi' }])
  expect(api.user.language).toBe('hi')
  expect(api.user.name).toBe('Riya Sharma')

  await page.getByRole('link', { name: text('hi', 'app.tabProfile') }).click()
  await expect(page.getByText(text('hi', 'language.profileHint'))).toBeVisible()
  await page.getByRole('button', { name: 'తెలుగు' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
  await expect(page.getByRole('heading', { name: text('te', 'profile.title') })).toBeVisible()
  await expect.poll(() => languagePatches(api).map((c) => c.body)).toEqual([{ language: 'hi' }, { language: 'te' }])
  expect(api.user.language).toBe('te')

  // A reload: Telugu at once, and nothing sent again
  await page.reload()
  await expect(page.getByRole('heading', { name: text('te', 'profile.title') })).toBeVisible()
  await page.waitForTimeout(300)
  expect(languagePatches(api)).toHaveLength(2)
})

test('a language choice that failed to save is sent again at the next start', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.busy.set('/auth/me', { times: 1, retryAfter: 0 }) // the one PATCH (never repeated by the client)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'मराठी' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'mr')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('language.unsynced:u1'))).toBe('mr')
  expect(api.user.language ?? null).toBeNull()

  await page.reload()
  await expect.poll(() => api.user.language).toBe('mr')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('language.unsynced:u1'))).toBeNull()
})

test('a shared phone: each account gets its own language back', async ({ page, api }) => {
  const asha = MockApi.completeUser()
  const ravi = { ...MockApi.completeUser(), id: 'u2', name: 'Ravi Kumar', email: 'ravi@example.com' }
  api.user = asha
  await page.goto('/signin')
  // A new phone: the language screen first
  await page.getByRole('button', { name: 'हिन्दी' }).click()
  await signInFromScreen(page, 'hi')
  await expect.poll(() => languagePatches(api).map((c) => c.body)).toEqual([{ language: 'hi' }])
  await page.goto('/profile')
  await page.getByRole('button', { name: text('hi', 'profile.signOut'), exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)

  // Ravi on the same phone: the sign-in screen shows the phone's last choice; he changes it to Telugu
  api.user = ravi
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await page.getByRole('link', { name: text('hi', 'language.change') }).click()
  await page.getByRole('button', { name: 'తెలుగు' }).click()
  await signInFromScreen(page, 'te')
  await expect(page.getByRole('link', { name: text('te', 'app.tabHome') })).toBeVisible()
  await expect.poll(() => languagePatches(api).map((c) => c.body)).toEqual([{ language: 'hi' }, { language: 'te' }])
  expect(api.user.language).toBe('te')
  await page.goto('/profile')
  await page.getByRole('button', { name: text('te', 'profile.signOut'), exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)

  // Asha again, without touching the languages: Hindi, hers
  api.user = { ...asha, language: 'hi' }
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
  await signInFromScreen(page, 'te')
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await expect(page.getByRole('link', { name: text('hi', 'app.tabHome') })).toBeVisible()
  // Asha's Hindi and Ravi's Telugu were saved once each: nothing more
  await page.waitForTimeout(300)
  expect(languagePatches(api)).toHaveLength(2)
})

test.describe('a phone set to Hindi', () => {
  test.use({ locale: 'hi-IN' })

  test('first open: the language screen asks in Hindi, Hindi first, the other languages still offered', async ({ page }) => {
    await page.goto('/signin')
    await expect(page).toHaveURL(/\/language$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
    await expect(page.getByRole('group').getByRole('button').first()).toHaveAccessibleName('हिन्दी, Hindi')
    for (const name of ['English', 'తెలుగు', 'मराठी', 'தமிழ்', 'ಕನ್ನಡ']) await expect(page.getByRole('button', { name })).toBeVisible()
  })
})

test('service names from the service list are spelt in Hindi, typed names stay; the booking lists them with pictures', async ({ page, context, api }) => {
  await signedIn(context, api)
  await context.addInitScript(() => localStorage.setItem('language', 'hi'))
  await page.goto('/salons/s1')
  await expect(page.locator('label', { hasText: 'हेयरकट' })).toBeVisible()
  await expect(page.locator('label', { hasText: 'बियर्ड ट्रिम' })).toBeVisible()
  await expect(page.locator('label', { hasText: 'हेयर कलर' })).toBeVisible()
  await expect(page.locator('label', { hasText: 'Haircut' })).toHaveCount(0)
  // The picture still follows the saved (English) name
  await expect(page.locator('label', { hasText: 'बियर्ड ट्रिम' }).locator('svg[data-icon="BEARD"]')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText(/हेयरकट ₹200 · बियर्ड ट्रिम ₹100/).first()).toBeVisible()
})

test('a booking\'s services show their pictures and Hindi names', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.completedVisit()
  await context.addInitScript(() => localStorage.setItem('language', 'hi'))
  const id = (api.bookings[0] as { id: string }).id
  await page.goto(`/bookings/${id}`)
  const line = page.locator('li', { hasText: 'हेयरकट' }).first()
  await expect(line).toBeVisible()
  await expect(line.locator('svg[data-icon="HAIRCUT"]')).toBeVisible()
})

test('no kirana category on Home', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  await expect(page.getByText('Shine Unisex Salon')).toBeVisible()
  await expect(page.getByText(/Kirana/i)).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(0)
})
