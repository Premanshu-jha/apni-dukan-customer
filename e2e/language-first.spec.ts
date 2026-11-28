import { readFileSync } from 'node:fs'
import { expect, signedIn, test } from './helpers'

const hi = (area: string) => JSON.parse(readFileSync(`src/i18n/hi/${area}.json`, 'utf8')) as Record<string, string>

test('a new phone opens on the language screen; Hindi is chosen once and sign-in is in Hindi, with Change', async ({ page }) => {
  await page.goto('/signin')
  // Nothing chosen yet: the language comes first, each language in its own script with its English name
  await expect(page).toHaveURL(/\/language$/)
  await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'తెలుగు, Telugu' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  await page.getByRole('button', { name: /^हिन्दी/ }).click()

  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await expect(page.getByRole('button', { name: hi('auth').sendCode })).toBeVisible()
  // Kept on this phone: a reload goes straight to sign-in, in Hindi
  await page.reload()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: hi('auth').sendCode })).toBeVisible()

  // Change (also said in English): the language screen again, now with Back; the number typed stays
  await page.getByLabel(hi('auth').phoneLabel).fill('98480')
  await page.getByRole('link', { name: `${hi('language').change} (Change)` }).click()
  await expect(page).toHaveURL(/\/language$/)
  await expect(page.getByRole('button', { name: hi('common').back })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
  await expect(page.getByLabel('Mobile number')).toHaveValue('98480')
  await expect(page.getByText('Language:')).toBeVisible()
})

test('a first visit at / chooses the language, then About is in it', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/language$/)
  await page.getByRole('button', { name: /^తెలుగు/ }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
})

test('a language that can’t be downloaded (offline) says so on the first screen, and English still works', async ({ page, context }) => {
  await page.goto('/signin')
  await expect(page).toHaveURL(/\/language$/)
  await context.setOffline(true)
  await page.getByRole('button', { name: /^తెలుగు/ }).click()
  // Said in Telugu (tapped because they read it), and in English, with English as the way on
  await expect(page.getByRole('alert')).toContainText('భాష డౌన్‌లోడ్ కాలేదు')
  await expect(page.getByRole('alert')).toContainText('or tap English')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await context.setOffline(false)
})

test("a salon's shared link on a new phone: the language screen says the salon comes next, then sign-in, then the salon", async ({ page, api }) => {
  await page.goto('/salons/s1')
  await expect(page).toHaveURL(/\/language$/)
  await expect(page.getByText('Next: sign in, then the salon you opened.')).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeVisible()
  api.user = { ...api.user, name: 'Riya Sharma', email: 'riya@example.com', emailVerified: true }
  await page.getByLabel('Mobile number').fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/salons\/s1$/)
})

test('the recover link opened on a new phone asks the language first', async ({ page }) => {
  await page.goto('/signin/recover')
  await expect(page).toHaveURL(/\/language$/)
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/signin\/recover$/)
})

test('the language is one tap away on Home (not only in Profile), and fits a 360px phone', async ({ page, context, api }) => {
  await context.addInitScript(() => {
    if (!localStorage.getItem('language')) localStorage.setItem('language', 'en')
  })
  await page.setViewportSize({ width: 360, height: 740 })
  await signedIn(context, api)
  await page.goto('/')
  await page.getByRole('button', { name: 'Language: English' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'తెలుగు' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})
