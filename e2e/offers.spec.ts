import { addDays, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

const tomorrow = () => addDays(todayIst(), 1)

test("a salon's offer: the badge, the page, the prices at the offer's times, and a booking that keeps it", async ({ page, context, api }) => {
  await signedIn(context, api)
  // 25% off the haircut tomorrow, 13:00 to 16:00
  api.offers = [{ id: 'of1', percentOff: 25, allServices: false, serviceIds: ['v1'], startsOn: tomorrow(), endsOn: tomorrow(), from: '13:00', until: '16:00' }]
  api.salons[0].offer = { percentOff: 25, startsOn: tomorrow(), endsOn: tomorrow() }
  await page.goto('/')
  await expect(page.getByText(/^25% off from \d+ \w{3}$/)).toBeVisible()
  await expect(page.getByText(/^25% off from \d+ \w{3}$/)).toHaveClass(/text-accent/)   // deals are the logo's orange

  await page.getByRole('link', { name: /Shine Unisex Salon/ }).click()
  const offers = page.getByRole('region', { name: 'Offers' })
  await expect(offers).toContainText('25% off on Haircut')
  await expect(offers).toContainText('13:00–16:00')
  // Never visited: no switch for its messages
  await expect(page.getByRole('switch', { name: /Offer messages from this salon/ })).toHaveCount(0)
  // The haircut's offer price next to its own
  const haircut = page.getByRole('listitem').filter({ hasText: 'Haircut' })
  await expect(haircut).toContainText('₹200')
  await expect(haircut).toContainText('₹150')
  await expect(offers.getByText('25% off', { exact: true })).toHaveClass(/text-accent/)
  await expect(haircut.getByText('₹150', { exact: true })).toHaveClass(/text-accent/)

  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByText("Times marked % have the salon's offer price.")).toBeVisible()
  await expect(page.getByRole('button', { name: /^1:00 PM to .*, offer price$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^10:00 AM to 10:30 AM$/ })).toBeVisible()   // outside: no offer
  await page.getByRole('button', { name: /^3:45 PM to .*, offer price$/ }).click()
  await page.getByRole('button', { name: 'Continue with 3:45 PM' }).click()
  await expect(page.getByText("The salon's offer price at this time.")).toBeVisible()
  await expect(page.locator('s', { hasText: '₹200' })).toBeVisible()
  await page.getByRole('button', { name: 'Book now' }).click()

  await expect(page.getByText("Booked at the salon's offer price.")).toBeVisible()
  expect(api.bookings[0].totalPricePaise).toBe(15000)
  expect(api.bookings[0].totalListPricePaise).toBe(20000)
})

test("the offer message's link picks the services the offer covers", async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offers = [{ id: 'of1', percentOff: 20, allServices: false, serviceIds: ['v1', 'v2', 'gone'], startsOn: todayIst(), endsOn: tomorrow(), from: null, until: null }]
  await page.goto('/salons/s1?offer=of1')
  await expect(page.getByLabel(/Haircut/)).toBeChecked()
  await expect(page.getByLabel(/Beard trim/)).toBeChecked()
  await expect(page).toHaveURL(/\/salons\/s1$/)
})

test('offer messages: stopped for one salon on its page, or for every salon on the profile', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.visitedS1 = true
  await page.goto('/salons/s1')
  const one = page.getByRole('switch', { name: /Offer messages from this salon/ })
  await expect(one).toHaveAttribute('aria-checked', 'true')
  await one.click()
  await expect(one).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => api.mutedS1).toBe(true)

  await page.goto('/profile')
  const all = page.getByRole('switch', { name: /Offers from salons I've visited/ })
  const comeBack = page.getByRole('switch', { name: /Come-back reminders/ })
  await expect(all).toHaveAttribute('aria-checked', 'true')
  await all.click()
  await expect(all).toHaveAttribute('aria-checked', 'false')
  // Only this switch was sent: the come-back reminders stay as they were
  await expect.poll(() => api.salonOffers).toBe(false)
  expect(api.comeBackReminders).toBe(true)
  await expect(comeBack).toHaveAttribute('aria-checked', 'true')
  const sent = api.calls.filter((c) => c.method === 'PUT' && c.path === '/api/v1/me/salon-preferences').at(-1)!
  expect(sent.body).toEqual({ salonOffers: false })
})

test('Confirm shows the price as it is now: an offer ended after the time was picked shows the normal price', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offers = [{ id: 'of1', percentOff: 25, allServices: true, serviceIds: [], startsOn: tomorrow(), endsOn: tomorrow(), from: null, until: null }]
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^3:45 PM to .*, offer price$/ }).click()
  api.offers = []   // the owner ends it now
  await page.getByRole('button', { name: 'Continue with 3:45 PM' }).click()
  await expect(page.getByText("The salon's offer price at this time.")).toHaveCount(0)
  await expect(page.getByText('Total · about 30 min')).toBeVisible()
  await expect(page.locator('s', { hasText: '₹200' })).toHaveCount(0)
})

test('moving a booking is priced again: out of the offer the normal price, said before moving', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offers = [{ id: 'of1', percentOff: 25, allServices: true, serviceIds: [], startsOn: tomorrow(), endsOn: tomorrow(), from: '13:00', until: '16:00' }]
  const b = api.makeBooking('b1', ['v1'], new Date(Date.parse(`${tomorrow()}T13:00:00+05:30`)).toISOString())
  api.bookings.push(b)
  expect(b.totalPricePaise).toBe(15000)
  await page.goto('/bookings/b1/move')
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^5:15 PM to / }).click()
  await expect(page.getByRole('status')).toContainText("₹200 (now ₹150). The salon's offer doesn't cover that time.")
  await page.getByRole('button', { name: 'Move to 5:15 PM' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  expect(api.bookings[0].totalPricePaise).toBe(20000)
})

test('an offer link for an offer that has ended says so; a backend without offers shows no offers switch', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1?offer=gone')
  await expect(page.getByText("That offer has ended. The prices below are the salon's own.")).toBeVisible()
  // An older backend: its preferences have no salonOffers, and it would refuse one
  await page.route('**/api/v1/me/salon-preferences', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ comeBackReminders: true }) }))
  await page.goto('/profile')
  await expect(page.getByRole('switch', { name: /Come-back reminders/ })).toBeVisible()
  await expect(page.getByRole('switch', { name: /Offers from salons I've visited/ })).toHaveCount(0)
})

test('Confirm says when the picked time was taken meanwhile, instead of a price for it', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^3:45 PM to / }).click()
  api.gone.add(new Date(Date.parse(`${tomorrow()}T15:45:00+05:30`)).toISOString())
  await page.getByRole('button', { name: 'Continue with 3:45 PM' }).click()
  await expect(page.getByText("That time isn't free any more.")).toBeVisible()
  await page.getByRole('button', { name: 'Pick another time' }).click()
  await expect(page).toHaveURL(/\/salons\/s1\/book$/)
})
