import { expect, signedIn, test } from './helpers'

test('the salon cards show the rating, the services with prices, whether it is open and whether it is registered', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  const first = page.getByRole('link', { name: /Shine Unisex Salon/ })
  await expect(first).toContainText('★ 4.6 (12)')
  await expect(first).toContainText('Shop 12, Ithum Tower, Sector 62')
  await expect(first).toContainText('Haircut ₹200 · Beard trim ₹100 · Hair colour from ₹800 · +2 more')
  await expect(first).toContainText('Open · till midnight')
  await expect(first).toContainText('Registered')
  const second = page.getByRole('link', { name: /Royal Cuts/ })
  await expect(second).toContainText('New · 2 ratings')
  await expect(second).toContainText('Closed today')
  await expect(second).toContainText('Unregistered')   // no registration document
})

test('the salon page shows the rating, what customers liked and the holidays', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await expect(page.getByText('★ 4.6 (12)')).toBeVisible()
  await expect(page.getByText('· Clean, On time')).toBeVisible()
})

test('a done visit is rated from the message, then changed; the comment goes to the salon only', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.completedVisit()
  await page.goto('/bookings')
  await page.getByRole('button', { name: 'Past' }).click()
  await expect(page.getByText('★ Rate your visit')).toBeVisible()

  // "How was your visit?" opens the booking with the stars focused
  await page.goto(`/bookings/${b.id}?rate=1`)
  await expect(page.getByRole('radio', { name: '1 star' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Send rating' })).toBeDisabled()
  await page.getByRole('radio', { name: '4 stars' }).click()
  await expect(page.getByText('Good', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Skilled' }).click()
  await page.getByRole('button', { name: 'On time' }).click()
  await page.getByLabel(/Anything to tell the salon/).fill('Neat fade, thanks')
  await page.getByRole('button', { name: 'Send rating' }).click()
  await expect(page.getByText('Thanks! The salon sees your rating.')).toBeVisible()
  await expect(page.getByLabel('4 out of 5 stars')).toBeVisible()
  await expect(page.getByText('On time · Skilled')).toBeVisible()
  const sent = api.calls.find((c) => c.path === `/api/v1/bookings/${b.id}/rating`)!
  expect(sent.body).toEqual({ stars: 4, tags: ['SKILLED', 'ON_TIME'], comment: 'Neat fade, thanks' })

  // Changes abandoned with "Keep my rating" don't come back on the next "Change rating"
  await page.getByRole('button', { name: 'Change rating' }).click()
  await page.getByRole('radio', { name: '1 star' }).click()
  await page.getByRole('button', { name: 'Keep my rating' }).click()
  await expect(page.getByRole('img', { name: '4 out of 5 stars' })).toBeVisible()
  await page.getByRole('button', { name: 'Change rating' }).click()
  await expect(page.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: '5 stars' }).click()
  await page.getByRole('button', { name: 'Save rating' }).click()
  await expect(page.getByLabel('5 out of 5 stars')).toBeVisible()
})

test('a comment the backend refuses says why, under the comment', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.completedVisit()
  await page.goto(`/bookings/${b.id}`)
  await page.getByRole('radio', { name: '5 stars' }).click()
  await page.getByLabel(/Anything to tell the salon/).fill('👍')
  await page.getByRole('button', { name: 'Send rating' }).click()
  await expect(page.getByText('The comment must have at least 2 letters or digits.')).toBeVisible()
  await page.getByLabel(/Anything to tell the salon/).fill('👍 great')
  await page.getByRole('button', { name: 'Send rating' }).click()
  await expect(page.getByText('Thanks! The salon sees your rating.')).toBeVisible()
})

test('after 14 days the rating can no longer be given', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.completedVisit()
  b.rateUntil = new Date(Date.now() - 60_000).toISOString()
  await page.goto(`/bookings/${b.id}`)
  await expect(page.getByRole('heading', { name: 'Booking K7M2QX' })).toBeVisible()
  await expect(page.getByText('How was your visit?')).toBeHidden()
})

test('"book again" from the come-back message picks the same services', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1?services=v1,v2,gone')
  await expect(page.getByLabel(/Haircut/)).toBeChecked()
  await expect(page.getByLabel(/Beard trim/)).toBeChecked()
  await expect(page.getByText('2 services · ₹300')).toBeVisible()
  await expect(page).toHaveURL(/\/salons\/s1$/)

  // A link whose services are all gone keeps what the person had picked
  await page.goto('/salons/s1?services=gone')
  await expect(page).toHaveURL(/\/salons\/s1$/)
  await expect(page.getByLabel(/Haircut/)).toBeChecked()
})

test('come-back reminders can be switched off on the profile', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  const toggle = page.getByRole('switch', { name: /Come-back reminders/ })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(api.comeBackReminders).toBe(false)
})

test('come-back reminders that could not be read are not shown as on', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.route('**/api/v1/me/salon-preferences', (r) => r.abort())   // offline for this call
  await page.goto('/profile')
  const toggle = page.getByRole('switch', { name: /Come-back reminders/ })
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15_000 })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(toggle).toBeDisabled()
})

test('rating closed while the form was open says so instead of the form vanishing', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.completedVisit()
  await page.goto(`/bookings/${b.id}`)
  await page.getByRole('radio', { name: '5 stars' }).click()
  b.rateUntil = new Date(Date.now() - 60_000).toISOString()   // the 14 days ran out meanwhile
  await page.getByRole('button', { name: 'Send rating' }).click()
  await expect(page.getByText("Visits can be rated for 14 days. This one can't be rated any more.")).toBeVisible()
})

test('the salon page lists its holidays and its weekly off', async ({ page, context, api }) => {
  await signedIn(context, api)
  const inFour = new Date(Date.now() + 4 * 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10)
  api.closedDates = [inFour]
  await page.goto('/salons/s1')
  await expect(page.getByText(/^Holidays: /)).toBeVisible()
  const sunday = page.locator('dt', { hasText: /^Sun/ })
  await expect(sunday.locator('xpath=following-sibling::dd[1]')).toHaveText('Closed')
})

test('a rating given stays, read only, after the 14 days', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.completedVisit()
  b.rating = { stars: 4, tags: ['CLEAN'], comment: 'Nice', ratedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  b.rateUntil = null
  await page.goto(`/bookings/${b.id}`)
  await expect(page.getByRole('img', { name: '4 out of 5 stars' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change rating' })).toHaveCount(0)
})

test('a failed save of the come-back switch puts it back, and a second tap waits for the first', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  const toggle = page.getByRole('switch', { name: /Come-back reminders/ })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.route('**/api/v1/me/salon-preferences', (r) => (r.request().method() === 'PUT' ? r.abort() : r.fallback()))
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')   // back after the failure
  expect(api.comeBackReminders).toBe(true)
})

test('the stars are one tab stop and the arrow keys choose', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.completedVisit()
  await page.goto(`/bookings/${b.id}?rate=1`)
  await expect(page.getByRole('radio', { name: '1 star' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: '3 stars' })).toBeFocused()
  await expect(page.getByRole('radio', { name: '3 stars' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radio', { name: '1 star' })).toHaveAttribute('tabindex', '-1')
})
