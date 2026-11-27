import { addDays, istInstant, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

/**
 * Getting help is the most obvious thing in the app (the usability round): Call us and WhatsApp us one tap away on
 * every help surface, with or without an email; nobody sent round in a loop; every dead end offers the next step.
 */

const CALL = 'tel:+919381251613'
const WHATSAPP = /^https:\/\/wa\.me\/919381251613\?text=/

/** Signed in with a name but no verified email (a brand-new customer). */
async function emailPending(context: import('@playwright/test').BrowserContext, api: import('./mockApi').MockApi) {
  await signedIn(context, api)
  api.user = { ...api.user, email: null, emailVerified: false }
  const session = api.savedSession()
  await context.addInitScript((s) => {
    if (localStorage.getItem('e2e.pending')) return
    localStorage.setItem('e2e.pending', '1')
    localStorage.setItem('ad.session', s)
  }, session)
}

/** Haircut at Shine, tomorrow 3:45 PM, up to Confirm booking. */
async function toConfirm(page: import('@playwright/test').Page) {
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^3:45 PM to / }).click()
  await page.getByRole('button', { name: 'Continue with 3:45 PM' }).click()
}

test('Need help: Call us and WhatsApp us under Write to us, the WhatsApp message naming the screen it came from', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/bookings')
  await page.getByRole('link', { name: 'Help' }).click()
  const call = page.getByRole('link', { name: 'Call us' }).first()
  const whatsApp = page.getByRole('link', { name: 'WhatsApp us' }).first()
  await expect(call).toHaveAttribute('href', CALL)
  await expect(whatsApp).toHaveAttribute('href', WHATSAPP)
  expect(decodeURIComponent((await whatsApp.getAttribute('href'))!)).toContain('I need help with: My bookings')
  await expect(page.getByText('Calls 10 AM–7 PM · WhatsApp anytime').first()).toBeVisible()
  // Writing: a person is still offered, under the form
  await page.getByRole('button', { name: 'Write to us' }).click()
  await expect(page.getByText('Rather talk to someone?')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toHaveCount(1)
  await page.getByLabel('Your message').fill('My booking shows the wrong time, please check.')
  await page.getByRole('button', { name: 'Send to support' }).click()
  await expect(page.getByText('Our reply also shows in My requests and under the bell on Home.')).toBeVisible()
})

test('no loop: Help on the email screen opens Need help, whose Write to us explains it there with Call and WhatsApp', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/verify-email')
  // The email screen itself offers a person, no email needed
  await expect(page.getByText('Stuck here? Talk to us, no email needed:')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', CALL)
  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page).toHaveURL(/\/help\?/)
  await page.getByRole('button', { name: 'Write to us' }).click()
  await expect(page).toHaveURL(/\/help\?/)   // still here, not sent back to the email screen
  await expect(page.getByRole('heading', { name: 'Verify your email to write here' })).toBeVisible()
  await expect(page.getByText("Can't do that now? Call us or WhatsApp us: no email needed.")).toBeVisible()
  await expect(page.getByRole('link', { name: 'WhatsApp us' }).first()).toHaveAttribute('href', WHATSAPP)
  // "Ask us instead" from the answers does the same
  await page.reload()
  await page.getByRole('searchbox', { name: 'Search the answers' }).fill('zzzz')
  await page.getByRole('button', { name: 'Ask us instead' }).click()
  await expect(page.getByRole('heading', { name: 'Verify your email to write here' })).toBeFocused()
  // An error's "Write to us" link (write=1) lands on the same page, with the words kept for after verifying
  await page.goto(`/help?${new URLSearchParams({ write: '1', about: 'My booking', text: 'The page said: offline' })}`)
  await expect(page).toHaveURL(/\/help\?/)
  await page.getByRole('button', { name: 'Verify my email' }).click()
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page.getByLabel('Your message')).toHaveValue('The page said: offline')
  await expect(page.getByLabel(/What's it about/)).toHaveValue('My booking')
})

test('the answers cover what stops people: the SMS code (with Call and WhatsApp right there), email, salon problems', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/help')
  await page.getByRole('searchbox', { name: 'Search the answers' }).fill('OTP')
  await expect(page.getByRole('button', { name: "The SMS code doesn't come. What can I do?" })).toHaveAttribute('aria-expanded', 'true')
  const answer = page.locator('li').filter({ hasText: "The SMS code doesn't come" })
  await expect(answer.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', CALL)
  await page.getByRole('searchbox', { name: 'Search the answers' }).fill('charged more')
  await expect(page.getByRole('button', { name: /The salon was closed, refused my booking or charged more/ })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search the answers' }).fill('running late')
  await expect(page.getByText(/the booking waits 10 minutes after its time/)).toBeVisible()
})

test('signed out: sign-in trouble has a person to call, on the code screen and on Contact', async ({ page, api }) => {
  void api   // the fake backend answers the code request
  await page.goto('/signin')
  await page.getByLabel('Mobile number').fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByText(/No SMS after 2 minutes\? Check the number above/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', CALL)
  await page.goto('/contact')
  await expect(page.getByRole('heading', { name: "Can't sign in?" })).toBeVisible()
  await expect(page.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute('href', WHATSAPP)
  await page.goto('/signin/recover')
  await expect(page.getByText('This works only with an email you verified in Clozest before.')).toBeVisible()
})

test('a failed Book now says why right above the button, with the next step: Back to the salon, or Write to us', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.setViewportSize({ width: 360, height: 640 })
  await toConfirm(page)
  api.bookError = { status: 409, code: 'NO_BARBER_FOR_SERVICES', message: 'No barber here does all of these services.' }
  await page.getByRole('button', { name: 'Book now' }).click()
  const alert = page.getByRole('alert').filter({ hasText: 'No barber here does all of these services.' })
  await expect(alert).toBeInViewport()
  await alert.getByRole('button', { name: 'Back to the salon' }).click()
  await expect(page).toHaveURL(/\/salons\/s1$/)

  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Continue with 3:45 PM' }).click()
  // A passing problem: Try again (the same booking key), and a person to call
  api.bookError = { status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }
  await page.getByRole('button', { name: 'Book now' }).click()
  const passing = page.getByRole('alert').filter({ hasText: 'Something went wrong. Please try again.' })
  await expect(passing.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', CALL)
  await passing.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1\?new=1$/)
})

test('a Book now refusal no form can fix: today\'s limit offers a call; the salon gone, another salon; anything else, Write to us', async ({ page, context, api }) => {
  await signedIn(context, api)
  await toConfirm(page)
  api.bookError = { status: 429, code: 'TOO_MANY_CHANGES', message: 'Too many bookings and changes today. Try again tomorrow.' }
  await page.getByRole('button', { name: 'Book now' }).click()
  const limit = page.getByRole('alert').filter({ hasText: 'Try again tomorrow.' })
  await expect(limit.getByRole('link', { name: 'WhatsApp us' })).toBeVisible()
  await expect(limit.getByRole('link', { name: 'Write to us about it' })).toHaveCount(0)
  api.bookError = { status: 404, code: 'SALON_NOT_FOUND', message: 'This salon is not on Clozest any more.' }
  await page.getByRole('button', { name: 'Book now' }).click()
  await page.getByRole('alert').getByRole('button', { name: 'Find another salon' }).click()
  await expect(page).toHaveURL(/\/$/)
  await toConfirm(page)
  api.bookError = { status: 409, code: 'SOMETHING_NEW', message: 'A new kind of refusal.' }
  await page.getByRole('button', { name: 'Book now' }).click()
  await page.getByRole('alert').getByRole('link', { name: 'Write to us about it' }).click()
  await expect(page.getByLabel('Your message')).toHaveValue('I tried to book and it said: A new kind of refusal.')
})

test('Pick a time names the services picked; a day with no free times offers the next day', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.noTimesOn.add(addDays(todayIst(), 1))
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByLabel(/Beard trim/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await expect(page.getByText('Haircut, Beard trim')).toBeVisible()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByText('No free times')).toBeVisible()
  await page.getByRole('button', { name: /^Try / }).click()
  await expect(page.getByRole('button', { name: /^3:45 PM to / })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Day' }).locator('[aria-pressed="true"]')).not.toHaveText('Tomorrow')
})

test('a booking marked missed: "Tell us" right under it, with what happened written; salon-cancelled: book another time', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), -1), '10:00'))
  api.bookings.push({ ...b, status: 'NO_SHOW', startCode: null, canChange: false, canMove: false })
  await page.goto('/bookings/b1')
  await expect(page.getByText('Marked missed by mistake?')).toBeVisible()
  await page.getByRole('link', { name: 'Tell us', exact: true }).click()
  await expect(page.getByLabel(/What's it about/)).toHaveValue('A booking marked missed')
  await expect(page.getByLabel('Your message')).toHaveValue(/was marked missed, but I was there\./)

  Object.assign(api.booking('b1')!, { status: 'CANCELLED_BY_SALON', cancelReason: 'Closed for a family function' })
  await page.goto('/bookings/b1')
  await expect(page.getByRole('link', { name: 'Tell us what happened' })).toBeVisible()
  await page.getByRole('link', { name: 'Book another time' }).click()
  await expect(page).toHaveURL(/\/salons\/s1$/)

  // The salon took back a missed mark (closed as cancelled by the salon, "No-show undone"): good news, nothing to do
  Object.assign(api.booking('b1')!, { cancelReason: 'No-show undone' })
  await page.goto('/bookings/b1')
  await expect(page.getByText('Reason: No-show undone', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Book another time' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tell us what happened' })).toHaveCount(0)
})

test('moving a booking says it worked, at the top; cancelling brings the note into sight', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 2), '11:00')))
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/bookings/b1')
  await expect(page.getByRole('link', { name: 'Running late? Move it to a later time' })).toBeVisible()
  await page.getByRole('button', { name: 'Move to another time' }).click()
  await page.getByRole('button', { name: /^3:45 PM to / }).click()
  await page.getByRole('button', { name: /^Move to 3:45 PM/ }).click()
  await expect(page).toHaveURL(/\/bookings\/b1$/)
  const moved = page.locator('[role="status"][tabindex="-1"]').filter({ hasText: /^Moved to / })
  await expect(moved).toBeFocused()
  // Said once: back to the booking from another screen, or a reload, doesn't say it again
  await page.reload()
  await expect(page.getByRole('heading', { name: /^Booking / })).toBeVisible()
  await expect(moved).toHaveCount(0)

  await page.goto('/bookings/b1')
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await page.getByRole('button', { name: 'Yes, cancel it' }).click()
  const note = page.locator('[role="status"][tabindex="-1"]').filter({ hasText: /Cancelled/ })
  await expect(note).toBeFocused()
  await expect(note).toBeInViewport()
})

test('no salons near: "Look near another place" is the first thing offered', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salons = []
  await page.goto('/')
  await page.getByRole('link', { name: 'Look near another place' }).click()
  await expect(page).toHaveURL(/\/places$/)
})

test('a bad rating says Clozest can act, with the booking filled in', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.completedVisit('b9')
  await page.goto('/bookings/b9?rate=1')
  await page.getByRole('radio', { name: /^2 stars/ }).click()
  // Not before it's saved (leaving would lose the rating)
  await expect(page.getByRole('link', { name: 'Tell Clozest' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Send rating' }).click()
  await expect(page.getByText('Something went wrong? Your comment goes to the salon only.')).toBeVisible()
  await page.getByRole('link', { name: 'Tell Clozest' }).click()
  await expect(page.getByLabel(/What's it about/)).toHaveValue('My visit to Shine Unisex Salon')
  // A good rating: no such line
  api.completedVisit('b8')
  await page.goto('/bookings/b8?rate=1')
  await page.getByRole('radio', { name: /^4 stars/ }).click()
  await page.getByRole('button', { name: 'Send rating' }).click()
  await expect(page.getByText('Thanks', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tell Clozest' })).toHaveCount(0)
})

test('Find on map works from the area, city and pincode (no house number yet); saving still asks for it', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/places/new')
  await page.getByLabel('Area').fill('Kondapur')
  await page.getByLabel('City').fill('Hyderabad')
  await page.getByLabel('Pincode').fill('500084')
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByText('Drag the pin onto your exact building, or tap the map where it is.')).toBeVisible()
  const sent = api.calls.find((c) => c.path === '/api/v1/me/places/geocode')!.body as Record<string, string>
  expect(sent).toMatchObject({ addressLine: 'Kondapur', area: 'Kondapur', city: 'Hyderabad', pincode: '500084' })
  await page.getByRole('button', { name: 'Save address' }).click()
  expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/me/places')).toBe(false)
})

test("Profile's help card offers a person: Call us and WhatsApp us", async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  await expect(page.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', CALL)
  await expect(page.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute('href', WHATSAPP)
})

test('in the last hour, being late is explained on the booking (too late to move)', async ({ page, context, api }) => {
  await signedIn(context, api)
  const b = api.makeBooking('b1', ['v1'], new Date(Date.now() + 30 * 60_000).toISOString())
  api.bookings.push({ ...b, canMove: false })
  await page.goto('/bookings/b1')
  await expect(page.getByText(/^Running late\? Go as soon as you can: the salon keeps it until /)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Running late? Move it to a later time' })).toHaveCount(0)
})

test('Move booking: a day with no free times offers the next one', async ({ page, context, api }) => {
  await signedIn(context, api)
  const day = addDays(todayIst(), 2)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(day, '11:00')))
  api.noTimesOn.add(addDays(todayIst(), 3))
  await page.goto('/bookings/b1/move')
  await page.getByRole('group', { name: 'Day' }).getByRole('button').nth(3).click()
  await expect(page.getByText('No free times')).toBeVisible()
  await page.getByRole('button', { name: /^Try / }).click()
  await expect(page.getByRole('group', { name: 'Day' }).locator('[aria-pressed="true"]')).toBeFocused()
  await expect(page.getByRole('button', { name: /^3:45 PM to / })).toBeVisible()
})

test('"Save as Home": what is typed survives a reload, and the GPS is not asked for again', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  await page.getByRole('region', { name: 'How booking works' }).getByRole('button', { name: 'Got it' }).click()
  await page.reload()
  await page.getByRole('region', { name: 'At home right now?' }).getByRole('link', { name: 'Save as Home' }).click()
  await expect(page.getByLabel('Area')).toHaveValue('Kondapur')   // filled from the GPS point
  const lookups = () => api.calls.filter((c) => c.path === '/api/v1/me/places/reverse-geocode').length
  const before = lookups()
  await page.getByLabel('House or flat number, building, street').fill('Flat 4B')
  await page.reload()
  await expect(page.getByLabel('House or flat number, building, street')).toHaveValue('Flat 4B')
  await page.waitForTimeout(500)
  expect(lookups()).toBe(before)
})

test('a returning customer on a 360×640 phone in Hindi: chips, the bar and the first salon all on the first screen', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.completedVisit('b9')
  api.places = [
    { id: '00000000-0000-4000-8000-000000000001', kind: 'HOME', name: null, addressLine: 'Flat 4B', area: 'Kondapur', city: 'Hyderabad', pincode: '500084', latitude: 28.627, longitude: 77.372, updatedAt: '2026-11-01T10:00:00Z', createdAt: '2026-11-01T10:00:01Z' },
    { id: '00000000-0000-4000-8000-000000000002', kind: 'WORK', name: null, addressLine: 'Cyber Towers', area: 'Madhapur', city: 'Hyderabad', pincode: '500081', latitude: 28.62, longitude: 77.37, updatedAt: '2026-11-01T10:00:00Z', createdAt: '2026-11-01T10:00:02Z' },
  ]
  // The one-time tip after a first visit already put away (a returning customer's usual Home)
  await context.addInitScript((id) => {
    localStorage.setItem('language', 'hi')
    localStorage.setItem(`ad.guide.${id}.visitTip`, '1')
  }, api.user.id)
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'इसके पास सैलून देखें' })).toBeVisible()
  await expect(page.locator('a[data-index="0"]')).toBeVisible()
  const tabs = (await page.locator('nav').last().boundingBox())!
  const first = (await page.locator('a[data-index="0"]').boundingBox())!
  expect(first.y + 40).toBeLessThanOrEqual(tabs.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test('another tab follows a chip picked here', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [{ id: '00000000-0000-4000-8000-000000000002', kind: 'WORK', name: null, addressLine: 'Cyber Towers', area: 'Madhapur', city: 'Hyderabad', pincode: '500081', latitude: 17.45, longitude: 78.38, updatedAt: '2026-11-01T10:00:00Z', createdAt: '2026-11-01T10:00:02Z' }]
  await page.goto('/')
  const other = await context.newPage()
  await other.goto('/')
  await page.getByRole('group', { name: 'Find salons near' }).getByRole('button', { name: 'Work' }).click()
  await expect(other.getByRole('group', { name: 'Find salons near' }).getByRole('button', { name: 'Work' })).toHaveAttribute('aria-pressed', 'true')
})

test('"Verify my email" from an answer comes back to Need help; the button is only for someone still to verify', async ({ page, context, api }) => {
  await emailPending(context, api)
  await page.goto('/help')
  await page.getByRole('searchbox', { name: 'Search the answers' }).fill('why verify')
  await page.getByRole('button', { name: 'Verify my email' }).click()
  await page.getByLabel('Email', { exact: true }).fill('riya@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page).toHaveURL(/\/help$/)
  await page.getByRole('searchbox', { name: 'Search the answers' }).fill('why verify')
  await expect(page.getByText(/It's how you get your account back/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verify my email' })).toHaveCount(0)
})
