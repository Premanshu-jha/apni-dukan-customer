import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, signedIn, test } from './helpers'
import type { MockApi } from './mockApi'

/** The search box above the salon list on Home: by a salon's name or a service, kept coming back from a salon. */

/** A text of the app in a language, from its own files (so a wording change doesn't break the test). */
function text(lang: string, key: string): string {
  const [area, name] = key.split('.')
  return (JSON.parse(readFileSync(join(process.cwd(), 'src/i18n', lang, `${area}.json`), 'utf8')) as Record<string, string>)[name]
}

const box = (page: Page) => page.getByRole('searchbox', { name: 'Search salons' })
const cards = (page: Page) => page.locator('a[data-index]')
const listCalls = (api: MockApi) => api.calls.filter((c) => c.path.startsWith('/api/v1/salons?'))

/** The two usual salons plus a facial place and a salon found only by its picture (a "Face clean-up" shown as FACIAL). */
function withServices(api: MockApi) {
  api.salons[0].searchServices = [{ name: 'Haircut', icon: 'HAIRCUT' }, { name: 'Beard trim', icon: 'BEARD' }, { name: 'Hair colour', icon: 'HAIR_COLOUR' }]
  api.salons[1].searchServices = [{ name: 'Haircut', icon: 'HAIRCUT' }]
  api.salons.push(
    { ...api.salons[1], id: 's3', name: 'Glow Studio', distanceKm: 1.2, distanceMetres: 1200, searchServices: [{ name: 'Gold Facial', icon: null }] },
    { ...api.salons[1], id: 's4', name: 'Glam Parlour', distanceKm: 1.5, distanceMetres: 1500, searchServices: [{ name: 'Face clean-up', icon: 'FACIAL' }] },
  )
  api.salons.sort((a, b) => a.distanceMetres - b.distanceMetres)
}

test('typing a service finds the salons offering it, nearest first, asking only once the typing pauses', async ({ page, context, api }) => {
  await signedIn(context, api)
  withServices(api)
  await page.goto('/')
  await expect(page.getByText('4 salons within 2 km, nearest first')).toBeVisible()
  await expect(box(page)).toHaveAttribute('placeholder', 'Salon or service (haircut, facial…)')
  await box(page).pressSequentially('facial', { delay: 40 })
  await expect(page.getByText('2 salons matching ‘facial’ within 2 km')).toBeVisible()
  await expect(cards(page)).toHaveCount(2)
  await expect(cards(page).nth(0)).toContainText('Glow Studio')
  await expect(cards(page).nth(1)).toContainText('Glam Parlour')   // by its picture
  expect(api.salonSearches).toEqual(['facial'])   // one request for the word, none per letter
  // A small slip is forgiven, and a salon is found by its name too
  await box(page).fill('facal')
  await expect(page.getByText('2 salons matching ‘facal’ within 2 km')).toBeVisible()
  await box(page).fill('royal')
  await expect(page.getByText('1 salon matching ‘royal’ within 2 km')).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText('Royal Cuts')
})

test('the words survive opening a salon and coming back, by the back arrow or the phone\'s Back, and a reload', async ({ page, context, api }) => {
  await signedIn(context, api)
  withServices(api)
  await page.goto('/')
  await box(page).fill('beard')
  await box(page).press('Enter')   // the keyboard's Search key: at once
  await expect(page.getByText('1 salon matching ‘beard’ within 2 km')).toBeVisible()
  await expect(box(page)).not.toBeFocused()   // the keyboard goes away to show the results
  await cards(page).first().click()
  await expect(page).toHaveURL(/\/salons\/s1$/)
  await page.getByRole('button', { name: 'Back' }).click()   // the page's arrow opens Home afresh
  await expect(page).toHaveURL(/\/$/)
  await expect(box(page)).toHaveValue('beard')
  await expect(page.getByText('1 salon matching ‘beard’ within 2 km')).toBeVisible()
  await cards(page).first().click()
  await page.goBack()
  await expect(box(page)).toHaveValue('beard')
  await expect(page.getByText('1 salon matching ‘beard’ within 2 km')).toBeVisible()
  await page.reload()
  await expect(box(page)).toHaveValue('beard')
  await expect(page.getByText('1 salon matching ‘beard’ within 2 km')).toBeVisible()
  // Another tab starts with the whole list (the words are this tab's own)
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.getByText('4 salons within 2 km, nearest first')).toBeVisible()
  await expect(box(other)).toHaveValue('')
})

test('nothing found: the words, a button back to all salons, and the help link with what was searched', async ({ page, context, api }) => {
  await signedIn(context, api)
  withServices(api)
  await page.goto('/')
  await box(page).fill('pedicure')
  await expect(page.getByText('No salon within 2 km offers ‘pedicure’ yet')).toBeVisible()
  const help = page.getByRole('link', { name: 'Let us know' })
  expect(decodeURIComponent((await help.getAttribute('href'))!.replace(/\+/g, ' '))).toContain('I searched for: pedicure')
  await page.getByRole('button', { name: 'Show all salons near you' }).click()
  await expect(page.getByText('4 salons within 2 km, nearest first')).toBeVisible()
  await expect(box(page)).toHaveValue('')
})

test('one letter waits for a second; × clears at once; chips search at once and again tap goes back', async ({ page, context, api }) => {
  await signedIn(context, api)
  withServices(api)
  await page.goto('/')
  await expect(page.getByText('4 salons within 2 km, nearest first')).toBeVisible()
  await box(page).fill('f')
  await expect(page.getByText('Type at least 2 letters to search')).toBeVisible()
  await page.waitForTimeout(500)
  expect(api.salonSearches).toEqual([])   // the backend would refuse one letter: never sent
  await expect(cards(page)).toHaveCount(4)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(box(page)).toHaveValue('')
  await expect(box(page)).toBeFocused()

  const chip = page.getByRole('button', { name: 'Hair colour' })
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('1 salon matching ‘Hair colour’ within 2 km')).toBeVisible()
  expect(api.salonSearches).toEqual(['hair colour'])
  await chip.click()
  await expect(page.getByText('4 salons within 2 km, nearest first')).toBeVisible()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  // Every chip has its picture (an SVG, never an emoji) and a tap-sized height
  const chips = page.getByRole('group', { name: 'Services people look for most' }).getByRole('button')
  await expect(chips).toHaveCount(7)
  for (const c of await chips.all()) {
    await expect(c.locator('svg[data-icon]')).toHaveCount(1)
    expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
})

test('many matches come 30 a page with "Show more salons", every page with the same words', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salons = Array.from({ length: 45 }, (_, i) => ({
    id: `x${String(i).padStart(2, '0')}`, name: i % 9 === 0 ? `Cuts ${i}` : `Facial Point ${i}`, area: 'Sector 18', city: 'Noida',
    distanceKm: Math.round((50 + i * 40) / 100) / 10, photoUrl: null, distanceMetres: 50 + i * 40, topServices: [], serviceCount: 0,
  }))
  await page.goto('/')
  await box(page).fill('facial point')
  await expect(page.getByText('Salons matching ‘facial point’ within 2 km, nearest first')).toBeVisible()
  await expect(cards(page)).toHaveCount(30)
  await page.getByRole('button', { name: 'Show more salons' }).click()
  await expect(cards(page)).toHaveCount(40)   // 45 less the 5 named Cuts
  await expect(page.getByText('40 salons matching ‘facial point’ within 2 km')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more salons' })).toBeHidden()
  const second = listCalls(api).find((c) => c.path.includes('afterId='))!
  expect(second.path).toContain('q=facial%20point')
  await expect(page.getByRole('link', { name: /Cuts/ })).toHaveCount(0)
})

test('offline: a new search says so, and runs once the connection is back; a failed search offers Try again', async ({ page, context, api }) => {
  await signedIn(context, api)
  withServices(api)
  await page.goto('/')
  await expect(page.getByText('4 salons within 2 km, nearest first')).toBeVisible()
  await context.setOffline(true)
  await box(page).fill('facial')
  await expect(page.getByText("You're offline. Connect to the internet to search.")).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText('2 salons matching ‘facial’ within 2 km')).toBeVisible()

  api.failSalonSearches = 3   // the first try and both automatic retries
  await box(page).fill('royal')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('1 salon matching ‘royal’ within 2 km')).toBeVisible()
})

test('in Hindi: the box and chips speak Hindi, and the Beard chip searches the English word salons use', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.user = { ...api.user, language: 'hi' }
  await context.addInitScript(() => window.localStorage.setItem('language', 'hi'))
  withServices(api)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  const hiBox = page.getByRole('searchbox', { name: text('hi', 'salon.searchLabel') })
  await expect(hiBox).toHaveAttribute('placeholder', text('hi', 'salon.searchPlaceholder'))
  await page.getByRole('button', { name: text('hi', 'service.beard') }).click()
  await expect(hiBox).toHaveValue('दाढ़ी')
  await expect.poll(() => api.salonSearches).toEqual(['beard'])
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText('Ithum')
})

test('a chip tapped in Hindi, then the app switched to English: it still searches "beard" and shows Beard pressed', async ({ page, context, api }) => {
  await signedIn(context, api)
  // Hindi until English is picked in Profile (never set again after that: a reload would)
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('e2e.lang')) localStorage.setItem('language', 'hi')
    sessionStorage.setItem('e2e.lang', '1')
  })
  withServices(api)
  await page.goto('/')
  await page.getByRole('button', { name: text('hi', 'service.beard') }).click()
  await expect.poll(() => api.salonSearches).toEqual(['beard'])
  await page.getByRole('link', { name: text('hi', 'app.tabProfile') }).click()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(box(page)).toHaveValue('Beard')
  await expect(page.getByRole('button', { name: 'Beard' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('1 salon matching ‘Beard’ within 2 km')).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
  expect(api.salonSearches.every((q) => q === 'beard')).toBe(true)   // never q=दाढ़ी
  // And after a reload, in English
  await page.reload()
  await expect(box(page)).toHaveValue('Beard')
  await expect(page.getByRole('button', { name: 'Beard' })).toHaveAttribute('aria-pressed', 'true')
})

test('Hindi words that are no chip label are searched as the English word salons use', async ({ page, context, api }) => {
  await signedIn(context, api)
  await context.addInitScript(() => window.localStorage.setItem('language', 'hi'))
  withServices(api)
  await page.goto('/')
  const hiBox = page.getByRole('searchbox', { name: text('hi', 'salon.searchLabel') })
  for (const [typed, sent] of [['फेशियल', 'facial'], ['हेयर', 'hair'], ['बियर्ड', 'beard'], ['मसाज', 'massage'], ['baal', 'baal']] as const) {
    await hiBox.fill(typed)
    await expect.poll(() => api.salonSearches.at(-1)).toBe(sent)
  }
  // The Hindi word stays in the box; the results are the English word's (from the cache: asked a moment ago)
  await hiBox.fill('बियर्ड')
  await expect(hiBox).toHaveValue('बियर्ड')
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText('Ithum')
})

test('too many searches: says so plainly, tries once more by itself after Retry-After, the words stay', async ({ page, context, api }) => {
  await signedIn(context, api)
  withServices(api)
  await page.goto('/')
  await expect(page.getByText('4 salons within 2 km, nearest first')).toBeVisible()
  api.limitSearches = { times: 1, retryAfter: 2 }
  await box(page).fill('facial')
  await expect(page.getByText('Too many searches. Wait a moment, we will search again for you.')).toBeVisible()
  await expect(box(page)).toHaveValue('facial')
  await expect(page.getByText('2 salons matching ‘facial’ within 2 km')).toBeVisible({ timeout: 10_000 })
  expect(api.limitedSearches).toEqual(['facial'])
  expect(api.salonSearches).toEqual(['facial'])

  // Still limited after the one more try: Try again, never a loop of requests
  api.limitSearches = { times: 5, retryAfter: 1 }
  await box(page).fill('royal')
  await expect(page.getByText('Too many searches. Wait a moment, then tap Try again.')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  expect(api.limitedSearches).toEqual(['facial', 'royal', 'royal'])
  api.limitSearches = { times: 0, retryAfter: 1 }
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('1 salon matching ‘royal’ within 2 km')).toBeVisible()
  await expect(box(page)).toHaveValue('royal')
})

test('the list without words has no search limit', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.searchesPerMinute = 0
  await page.goto('/')
  await expect(page.getByText('2 salons within 2 km, nearest first')).toBeVisible()
  expect(api.limitedSearches).toEqual([])
})
