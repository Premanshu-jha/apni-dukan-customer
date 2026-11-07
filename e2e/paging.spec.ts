import type { Page } from '@playwright/test'
import { addDays, istInstant, micros, MockApi, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

/**
 * n past bookings, three at each quarter hour (so ties sit across page ends), each start with microseconds as the
 * backend sends them. Returns them in the backend's order: latest first, then id.
 */
function pastBookings(api: MockApi, n: number) {
  const day = addDays(todayIst(), -3)
  for (let i = 0; i < n; i++) {
    const start = new Date(Date.parse(istInstant(day, '00:15')) + Math.floor(i / 3) * 15 * 60_000).toISOString()
    const b = api.makeBooking(`b${api.bookings.length + 1}`, ['v1'], start)
    Object.assign(b, { startsAt: start.replace('.000Z', '.000123Z'), status: 'COMPLETED', startCode: null, canChange: false, canMove: false })
    api.bookings.push(b)
  }
  return [...api.bookings]
    .filter((b) => b.status === 'COMPLETED')
    .sort((x, y) => micros(y.startsAt as string) - micros(x.startsAt as string) || ((x.id as string) < (y.id as string) ? -1 : 1))
}

const cards = (page: Page) => page.locator('a[data-index]')

async function openPast(page: Page) {
  await page.goto('/bookings')
  await page.getByRole('button', { name: 'Past' }).click()
}

test('past bookings: 30 a page latest first; ties across a page end are neither lost nor repeated; focus on the first new one', async ({ page, context, api }) => {
  await signedIn(context, api)
  const order = pastBookings(api, 75)
  await openPast(page)
  await expect(cards(page)).toHaveCount(30)
  await expect(page.getByText('Your latest 30 bookings, latest first')).toBeVisible()
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(60)
  await expect(page.locator('a[data-index="30"]')).toBeFocused()
  // Asked after the 30th, its start sent back exactly as received
  const second = api.calls.find((c) => c.path.startsWith('/api/v1/me/bookings?when=past&'))!
  expect(second.path).toBe(
    `/api/v1/me/bookings?when=past&afterStart=${encodeURIComponent(order[29].startsAt as string)}&afterId=${order[29].id}`,
  )
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(75)
  await expect(page.getByText('75 past bookings, latest first')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more bookings' })).toBeHidden()
  const hrefs = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  expect(hrefs).toEqual(order.map((b) => `/bookings/${b.id}`))
})

test('exactly 30 past bookings: one more (empty) page, then the count gets the focus and the button goes', async ({ page, context, api }) => {
  await signedIn(context, api)
  pastBookings(api, 30)
  await openPast(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(page.getByText('30 past bookings, latest first')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Show more bookings' })).toBeHidden()
})

test('a failed "Show more bookings" keeps the list and says so; offline says so at once; tapping again works', async ({ page, context, api }) => {
  await signedIn(context, api)
  pastBookings(api, 40)
  await openPast(page)
  await expect(cards(page)).toHaveCount(30)
  api.failPastPages = 3 // the first try and both automatic retries
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(page.getByRole('button', { name: 'Loading more bookings…' })).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByRole('alert')).toContainText("Couldn't load more bookings. Tap Show more bookings to try again.")
  await expect(cards(page)).toHaveCount(30)
  await expect(page.getByRole('button', { name: 'Show more bookings' })).toBeFocused()

  await context.setOffline(true)
  const before = api.calls.length
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(page.getByRole('alert')).toContainText("You're offline. Connect to the internet and tap Show more bookings again.")
  expect(api.calls.length).toBe(before)
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(40)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const [total, more] of [[301, true], [300, false]] as const) {
  test(`past bookings stop at 300; with ${total} the note ${more ? 'shows' : 'is not shown (nothing comes after)'}`, async ({ page, context, api }) => {
    await signedIn(context, api)
    pastBookings(api, total)
    await openPast(page)
    for (let n = 60; n <= 300; n += 30) {
      await page.getByRole('button', { name: 'Show more bookings' }).click()
      await expect(cards(page)).toHaveCount(n)
    }
    await expect(page.getByRole('button', { name: 'Show more bookings' })).toBeHidden()
    // The page after the cap is asked once, only to know whether anything comes after
    const pastCalls = () => api.calls.filter((c) => c.path.startsWith('/api/v1/me/bookings?when=past')).length
    await expect.poll(pastCalls).toBe(11)
    if (more) {
      await expect(page.getByText('Showing your latest 300 bookings.')).toBeVisible()
      await expect(page.getByText('Your latest 300 bookings, latest first')).toBeVisible()
    } else {
      await expect(page.getByText('300 past bookings, latest first')).toBeVisible()
      await expect(page.getByText('Showing your latest 300 bookings.')).toHaveCount(0)
    }
  })
}

test('a refresh with two pages of past bookings asks those two again, in the new order', async ({ page, context, api }) => {
  await signedIn(context, api)
  pastBookings(api, 75)
  await openPast(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(60)
  // A booking that just ended comes first now
  const b = api.makeBooking('b999', ['v1'], new Date(Date.now() - 2 * 3600_000).toISOString())
  Object.assign(b, { status: 'COMPLETED', canChange: false, canMove: false })
  api.bookings.push(b)
  const pastCalls = () => api.calls.filter((c) => c.path.startsWith('/api/v1/me/bookings?when=past')).length
  const before = pastCalls()
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const expected = [...api.bookings]
    .sort((x, y) => micros(y.startsAt as string) - micros(x.startsAt as string) || ((x.id as string) < (y.id as string) ? -1 : 1))
    .slice(0, 60)
    .map((x) => `/bookings/${x.id}`)
  await expect.poll(() => cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(expected)
  expect(pastCalls() - before).toBe(2)
})

test('upcoming bookings come in one answer; the fake backend refuses cursors as the backend does', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  api.bookings.push(api.makeBooking('b2', ['v2'], istInstant(addDays(todayIst(), 2), '11:30')))
  await page.goto('/bookings')
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Show more bookings' })).toHaveCount(0)

  const auth = api.calls.filter((c) => c.auth).at(-1)!.auth!
  const ask = (path: string) =>
    page.evaluate(
      async ([p, a]) => {
        const r = await fetch(`http://api.test/api/v1${p}`, { headers: { Authorization: a } })
        return { status: r.status, body: await r.json() }
      },
      [path, auth] as const,
    )
  const cursor = 'afterStart=2026-11-06T04:30:00.123456Z&afterId=b1'
  expect(await ask(`/me/bookings?when=upcoming&${cursor}`)).toMatchObject({
    status: 400,
    body: { code: 'VALIDATION_FAILED', details: { afterStart: 'pages are only for when=past' } },
  })
  expect(await ask('/me/bookings?when=past&afterId=b1')).toMatchObject({
    status: 400,
    body: { code: 'VALIDATION_FAILED', details: { afterId: 'send afterStart and afterId together' } },
  })
  expect(await ask('/me/bookings?when=past&afterStart=last-week&afterId=b1')).toMatchObject({ status: 400, body: { code: 'BAD_REQUEST' } })
  expect(await ask('/me/bookings?when=past&afterStart=2026-11-06T04:30:00Z&afterId=x')).toMatchObject({ status: 400, body: { code: 'BAD_REQUEST' } })
  expect(await ask('/me/notifications?cursor=nope')).toMatchObject({ status: 400, body: { code: 'BAD_CURSOR' } })
})

test('too many salon pages in a minute: "Too many tries — wait a minute", and nothing is retried by itself', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.readsPerMinute = 2 // the salon page and its services; the free times are the third
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await expect(page.getByText('Too many tries — wait a minute, then try again.')).toBeVisible()
  const availability = () => api.calls.filter((c) => c.path.startsWith('/api/v1/salons/s1/availability')).length
  expect(availability()).toBe(1)
  await page.waitForTimeout(3000)
  expect(availability()).toBe(1)
})

test('a salon page answered 429 says to wait, without retrying', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.readsPerMinute = 0
  await page.goto('/salons/s1')
  await expect(page.getByText('Too many tries — wait a minute, then try again.')).toBeVisible()
  await page.waitForTimeout(3000)
  expect(api.calls.filter((c) => c.path === '/api/v1/salons/s1').length).toBe(1)
  expect(api.calls.filter((c) => c.path === '/api/v1/salons/s1/services').length).toBe(1)
  // Once the minute is over, Try again works
  api.readsPerMinute = 60
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Shine Unisex Salon' })).toBeVisible()
})

test('messages: 30 a page, at most 300 kept on screen, then a note', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.inbox = Array.from({ length: 330 }, (_, i) => ({
    id: `n${i}`,
    type: 'BOOKING_CONFIRMED',
    title: `Booked ${i + 1}`,
    body: 'x',
    url: null,
    sentAt: new Date(Date.now() - i * 60_000).toISOString(),
    read: true,
  }))
  await page.goto('/notifications')
  for (let n = 60; n <= 300; n += 30) {
    await page.getByRole('button', { name: 'Show older' }).click()
    await expect(page.getByText(/^Booked \d+$/)).toHaveCount(n)
  }
  await expect(page.getByText('Showing the latest 300 messages.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show older' })).toBeHidden()
})

test('a salon page refresh answered 429 keeps the page with a note, and is not retried', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.clock.install()
  await page.goto('/salons/s1')
  await expect(page.getByRole('heading', { name: 'Shine Unisex Salon' })).toBeVisible()
  api.readsPerMinute = 2 // the two reads just made use up the minute
  await page.clock.fastForward(61_000) // the page is stale: coming back re-reads it
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText("Couldn't refresh this salon: Too many tries — wait a minute, then try again.")).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Shine Unisex Salon' })).toBeVisible()
  await page.clock.fastForward(10_000)
  expect(api.calls.filter((c) => c.path === '/api/v1/salons/s1').length).toBe(2)
})

test('messages: a refresh with every page loaded asks those 10 pages again, no more', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.inbox = Array.from({ length: 330 }, (_, i) => ({
    id: `n${i}`, type: 'BOOKING_CONFIRMED', title: `Booked ${i + 1}`, body: 'x', url: null,
    sentAt: new Date(Date.now() - i * 60_000).toISOString(), read: true,
  }))
  await page.goto('/notifications')
  for (let n = 60; n <= 300; n += 30) {
    await page.getByRole('button', { name: 'Show older' }).click()
    await expect(page.getByText(/^Booked \d+$/)).toHaveCount(n)
  }
  const lists = () => api.calls.filter((c) => c.path.startsWith('/api/v1/me/notifications?') || c.path === '/api/v1/me/notifications').length
  const before = lists()
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(lists).toBe(before + 10)
  await page.waitForTimeout(500)
  expect(lists()).toBe(before + 10)
})

test('a busy backend (503 SERVICE_BUSY, Retry-After): the client waits and tries once, then the query waits Retry-After too', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  api.busy.set('/bookings/b1', { times: 2, retryAfter: 2 })
  await page.goto('/bookings/b1')
  await expect(page.getByRole('button', { name: 'Move to another time' })).toBeVisible({ timeout: 15_000 })
  const at = api.calls.filter((c) => c.path === '/api/v1/bookings/b1').map((c) => c.at)
  expect(at.length).toBeGreaterThanOrEqual(3)
  expect(at[1] - at[0]).toBeGreaterThanOrEqual(1900) // the client's own wait
  expect(at[2] - at[1]).toBeGreaterThanOrEqual(1900) // the query's retry, after Retry-After (not 1 s)
})
