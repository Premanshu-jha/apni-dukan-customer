import type { Page } from '@playwright/test'
import { expect, signedIn, test } from './helpers'

/** Counts DOM changes inside the first element matching `selector` from now on. */
async function watch(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const w = window as unknown as { changes: number }
    w.changes = 0
    new MutationObserver((list) => (w.changes += list.length)).observe(document.querySelector(sel)!, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
  }, selector)
  return () => page.evaluate(() => (window as unknown as { changes: number }).changes)
}

test('an unchanged bell and message list are answered 304 and nothing on screen changes', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.inbox = [1, 2].map((i) => ({
    id: `n${i}`, type: 'BOOKING_CONFIRMED', title: `Booking confirmed ${i}`, body: 'Shine Unisex Salon', url: null, sentAt: new Date(Date.now() - i * 60_000).toISOString(), read: false,
  }))
  await page.goto('/')
  const bell = page.getByRole('link', { name: 'Messages, 2 unread' })
  await expect(bell).toBeVisible()
  const count = '/api/v1/me/notifications/unread-count?app=customer'
  const bellChanges = await watch(page, 'a[href="/notifications"]')
  // Coming back to the app asks again with the ETag it holds
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.notModified.filter((p) => p === count).length).toBeGreaterThan(0)
  expect(await bellChanges()).toBe(0)

  await bell.click()
  await expect(page.getByText('Booking confirmed 2')).toBeVisible()
  const list = '/api/v1/me/notifications?app=customer'
  const listChanges = await watch(page, 'main ul')
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.notModified.filter((p) => p === list).length).toBeGreaterThan(0)
  expect(await listChanges()).toBe(0)

  // A new message: 200 with the new list, shown at once
  api.inbox.unshift({ id: 'n0', type: 'BOOKING_REMINDER', title: 'Your booking is in 1 hour', body: 'x', url: null, sentAt: new Date().toISOString(), read: false })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Your booking is in 1 hour')).toBeVisible()
  await expect(page.getByText('3 unread')).toBeVisible()
})
