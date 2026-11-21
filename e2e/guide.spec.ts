import { addDays, istInstant, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'
import type { Page } from '@playwright/test'

/** The Help button in the title bar (exact: "Need help with this booking?" is a link too). */
const help = (page: Page) => page.getByRole('link', { name: /^Help/ })
const ticketReads = (calls: { method: string; path: string }[]) =>
  calls.filter((c) => c.method === 'GET' && c.path === '/api/v1/helpdesk/tickets').length

test('Help is at the top right of every screen, says where it came from, and is not on the help screens', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.setViewportSize({ width: 360, height: 640 })
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))

  for (const path of ['/', '/bookings', '/profile', '/salons/s1', '/places', '/notifications', '/bookings/b1']) {
    await page.goto(path)
    const button = help(page)
    await expect(button).toBeVisible()
    // Fully on screen on a small phone, and never on top of the bell
    const box = (await button.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await page.goto('/')
  const bell = (await page.getByRole('link', { name: 'Messages' }).boundingBox())!
  const button = (await help(page).boundingBox())!
  expect(button.x + button.width).toBeLessThanOrEqual(bell.x)

  // A salon's page: Need help starts with the salon's name as the subject (once Write to us is tapped)
  await page.goto('/salons/s1')
  await help(page).click()
  await expect(page).toHaveURL(/\/help\?about=Salon/)
  await expect(page.getByRole('heading', { name: 'How do I…?' })).toBeVisible()
  await expect(help(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Write to us' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('Salon: Shine Unisex Salon')
  await expect(page.getByLabel("What's it about? (optional)")).toBeFocused()

  // A booking's page: its number
  await page.goto('/bookings/b1')
  await help(page).click()
  await page.getByRole('button', { name: 'Write to us' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue(/^Booking /)

  // Not on My requests either
  await page.goto('/help/requests')
  await expect(help(page)).toHaveCount(0)
})

test('a long salon name wraps under the title bar without pushing Help off a 360 px screen', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.setViewportSize({ width: 360, height: 640 })
  api.salonName = 'Shine Unisex Salon and Spa for Men, Women and Kids, Sector 62 Branch'
  await page.goto('/salons/s1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shine Unisex Salon and Spa')
  const box = (await help(page).boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(360)
})

test('signed out, Help goes to the public Contact page, and nothing asks for requests', async ({ page, api }) => {
  await page.goto('/signin')
  await expect(help(page)).toBeVisible()
  await help(page).click()
  await expect(page).toHaveURL(/\/contact$/)
  await expect(help(page)).toHaveCount(0)
  await page.goto('/signin/recover')
  await help(page).click()
  await expect(page).toHaveURL(/\/contact$/)
  expect(ticketReads(api.calls)).toBe(0)
})

test('"Support replied": a dot on Help until the reply is opened; one read, not one per screen', async ({ page, context, api }) => {
  await signedIn(context, api)
  const ticket = api.newTicket('CUSTOMER', 'Refund', 'My booking was cancelled by the salon.')
  api.supportReplies(ticket, 'We have noted it.')
  await page.goto('/profile')
  await expect(page.getByRole('link', { name: 'Help Support replied to you' })).toBeVisible()
  // Moving around the app doesn't ask again (cached for 2 minutes; no polling)
  await page.getByRole('link', { name: 'Bookings' }).click()
  await expect(page.getByRole('link', { name: 'Help Support replied to you' })).toBeVisible()
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(help(page)).toBeVisible()
  expect(ticketReads(api.calls)).toBe(1)

  // Need help shows it under My requests
  await help(page).click()
  await expect(page.getByRole('link', { name: /^My requests/ })).toContainText('1 reply from us')
  await page.getByRole('link', { name: /^My requests/ }).click()
  await page.getByText('Refund').click()
  await expect(page.getByText('We have noted it.')).toBeVisible()
  await page.goto('/profile')
  await expect(help(page)).toHaveAccessibleName('Help')

  // A new reply later brings it back
  api.supportReplies(ticket, 'And the refund is on its way.')
  ticket.lastMessageAt = new Date(Date.now() + 1000).toISOString()
  ticket.lastReplyAt = ticket.lastMessageAt
  await page.reload()
  await expect(page.getByRole('link', { name: 'Help Support replied to you' })).toBeVisible()
})

test('a reply that also resolves the request: the dot shows and it counts as a reply from us until opened', async ({ page, context, api }) => {
  await signedIn(context, api)
  const ticket = api.newTicket('CUSTOMER', 'Refund', 'My booking was cancelled by the salon.')
  api.supportRepliesAndResolves(ticket, 'The refund is done. Closing this.')
  expect(ticket.status).toBe('RESOLVED')
  await page.goto('/profile')
  await expect(page.getByRole('link', { name: 'Help Support replied to you' })).toBeVisible()
  await help(page).click()
  await expect(page.getByRole('link', { name: /^My requests/ })).toContainText('1 reply from us')
  await page.getByRole('link', { name: /^My requests/ }).click()
  await page.getByText('Refund').click()
  await expect(page.getByText('The refund is done. Closing this.')).toBeVisible()
  await page.goto('/help')
  await expect(page.getByRole('link', { name: /^My requests/ })).toContainText('Your questions to us and our replies')
  await expect(help(page)).toHaveCount(0)
  await page.goto('/profile')
  await expect(help(page)).toHaveAccessibleName('Help')
})

test('with the email pending, Help never asks for requests (none can exist)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.user = { ...api.user, email: null, emailVerified: false }
  const session = api.savedSession()
  await context.addInitScript((s) => {
    if (localStorage.getItem('e2e.pending')) return
    localStorage.setItem('e2e.pending', '1')
    localStorage.setItem('ad.session', s)
  }, session)
  await page.goto('/profile')
  await expect(help(page)).toBeVisible()
  await help(page).click()
  await expect(page.getByRole('heading', { name: 'How do I…?' })).toBeVisible()
  expect(ticketReads(api.calls)).toBe(0)
})

test('a Help button never replaces what was already typed in Need help', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/help')
  await page.getByRole('button', { name: 'Write to us' }).click()
  await page.getByLabel("What's it about? (optional)").fill('My refund')
  await page.getByLabel('Your message').fill('Half written about the refund')
  await page.goto('/salons/s1')
  await help(page).click()
  // The draft opens at once, as it was
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('My refund')
  await expect(page.getByLabel('Your message')).toHaveValue('Half written about the refund')
})

test('the answers: search, read, and "Take me there"; nothing found offers to ask us', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/help')
  // Write to us first, then My requests, then the answers
  const write = (await page.getByRole('button', { name: 'Write to us' }).boundingBox())!
  const requests = (await page.getByRole('link', { name: /^My requests/ }).boundingBox())!
  const answers = (await page.getByRole('heading', { name: 'How do I…?' }).boundingBox())!
  expect(write.y).toBeLessThan(requests.y)
  expect(requests.y).toBeLessThan(answers.y)
  await expect(page.getByRole('link', { name: /^My requests/ })).toContainText('Your questions to us and our replies')

  await page.getByRole('button', { name: 'What if I miss a booking?' }).click()
  await expect(page.getByText(/3 within 60 days stop online booking for 30 days/)).toBeVisible()

  await page.getByLabel('Search the answers').fill('free cancel')
  await expect(page.getByText(/Cancelling is free until 1 hour before the start/)).toBeVisible()
  await page.getByRole('button', { name: 'Take me there →' }).first().click()
  await expect(page).toHaveURL(/\/bookings$/)

  await page.goto('/help')
  await page.getByLabel('Search the answers').fill('zzzz')
  await expect(page.getByText('No answer for that yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Ask us instead' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('zzzz')
  await page.getByLabel("What's it about? (optional)").fill('')

  // "No salons near me": tell us the area, the form starts with the same subject as Home's "Let us know"
  await page.goto('/help')
  await page.getByRole('button', { name: 'There are no salons near me. What can I do?' }).click()
  await page.getByRole('button', { name: 'Tell us your area →' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('Please add salons near me')

  // The language answer opens Profile at the language
  await page.goto('/help')
  await page.getByRole('button', { name: 'How do I change the language?' }).click()
  await page.getByRole('button', { name: 'Take me there →' }).click()
  await expect(page).toHaveURL(/\/profile#language$/)
  await expect(page.locator('#language')).toBeInViewport()
})

test('the answers in Hindi; a Hindi reader may search in English', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.addInitScript(() => localStorage.setItem('language', 'hi'))
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'यह कैसे करें…?' })).toBeVisible()
  await page.getByRole('searchbox').fill('cancel')
  await expect(page.getByRole('button', { name: 'कब तक मुफ़्त में कैंसल कर सकते हैं?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'हमें लिखें' })).toBeVisible()
})

test('an error screen offers to write to us, with the error already written in', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.salonGone = true
  await page.goto('/salons/s1')
  await expect(page.getByText('This salon is not on Apni Dukan right now.')).toBeVisible()
  await expect(page.getByText('Still not working?')).toBeVisible()
  await page.getByRole('link', { name: 'Write to us' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue("Something isn't working")
  await expect(page.getByLabel('Your message')).toHaveValue(/On the screen \/salons\/s1 I see: "This salon is not on Apni Dukan right now\."/)
})

test('Profile: Need help is the first card, Write to support opens the form, the answers link opens Need help', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  const helpCard = (await page.getByText('Need help?', { exact: true }).boundingBox())!
  const name = (await page.getByText('Riya Sharma').boundingBox())!
  expect(helpCard.y).toBeLessThan(name.y)
  await page.getByRole('link', { name: 'Write to support' }).click()
  await expect(page.getByLabel('Your message')).toBeVisible()
  await page.goto('/profile')
  await page.getByRole('link', { name: /^Quick answers/ }).click()
  await expect(page.getByRole('heading', { name: 'How do I…?' })).toBeVisible()
})

test('How booking works on Home for someone who never booked: the real rules, Got it stays gone', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  const card = page.getByRole('region', { name: 'How booking works' })
  await expect(card).toBeVisible()
  // One line until tapped, so the search box and the salons stay on the first screen
  await expect(card.getByText('Pick a salon and tick services')).toBeHidden()
  await card.getByRole('button', { name: 'How booking works' }).click()
  await expect(card.getByRole('button', { name: 'How booking works' })).toHaveAttribute('aria-expanded', 'true')
  await expect(card.getByText('Pick a salon and tick services')).toBeVisible()
  await expect(card.getByText('At the salon, show your code and pay there')).toBeVisible()
  await expect(card).toContainText('Free to cancel until 1 hour before the start, and for 10 minutes after booking.')
  await expect(card).toContainText('3 in 60 days stop online booking for 30 days')
  // Above the salons
  const cardBox = (await card.boundingBox())!
  const firstSalon = (await page.getByText('Shine Unisex Salon').first().boundingBox())!
  expect(cardBox.y).toBeLessThan(firstSalon.y)
  await card.getByRole('button', { name: 'Got it' }).click()
  await expect(card).toBeHidden()
  await page.reload()
  await expect(page.getByText('Shine Unisex Salon').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'How booking works' })).toBeHidden()
})

test('How booking works is not shown to someone who has booked', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'How booking works' })).toBeHidden()
})

test('first-time hints on the salon page, Pick a time and the booking: once per account', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  const salonHint = page.getByRole('note').filter({ hasText: 'Tick the services you want, then tap Pick a time at the bottom.' })
  await expect(salonHint).toBeVisible()
  await salonHint.getByRole('button', { name: 'Got it' }).click()
  await expect(salonHint).toBeHidden()
  await page.reload()
  await expect(page.getByLabel(/Haircut/)).toBeVisible()
  await expect(salonHint).toBeHidden()

  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await expect(page.getByRole('note').filter({ hasText: 'Tap a day, then a free time.' })).toBeVisible()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1/)
  // Only what the code card above it doesn't say already
  const bookingHint = page.getByRole('note').filter({ hasText: 'Move or cancel with the buttons further down.' })
  await expect(bookingHint).toBeVisible()
  await expect(bookingHint).not.toContainText('4-digit code')
  await bookingHint.getByRole('button', { name: 'Got it' }).click()
  await page.reload()
  await expect(page.getByText('Show this code at the salon when you arrive')).toBeVisible()
  await expect(bookingHint).toBeHidden()
  // Kept for this account only (another account on the phone still gets them)
  expect(await page.evaluate(() => localStorage.getItem('ad.guide.u1.hint.salon'))).toBe('1')
})

test('"Tell me if an earlier time opens" is on screen without scrolling on a small phone', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByLabel(/Beard trim/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByRole('switch', { name: 'Tell me if an earlier time opens' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByText('Tell me if an earlier time opens')).toBeInViewport({ ratio: 1 })
})

test('after a finished visit, once: come-back reminders and offer messages switched right there', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.completedVisit('b9')
  await page.goto('/')
  const tip = page.getByRole('region', { name: 'Want a reminder for next time?' })
  await expect(tip).toBeVisible()
  await expect(page.getByRole('region', { name: 'How booking works' })).toBeHidden()
  await tip.getByRole('switch', { name: 'Come-back reminders' }).click()
  await expect(tip.getByRole('switch', { name: 'Come-back reminders' })).toHaveAttribute('aria-checked', 'false')
  await page.goto('/bookings/b9')
  await expect(page.getByRole('region', { name: 'Want a reminder for next time?' })).toBeVisible()
  await page.getByRole('region', { name: 'Want a reminder for next time?' }).getByRole('button', { name: 'Got it' }).click()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Want to book again?' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Want a reminder for next time?' })).toBeHidden()
})

test('a first-timer on their current location is told, once, that Home and Work can be saved', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  const hint = page.getByRole('note').filter({ hasText: 'Save Home or Work once' })
  // Not while How booking works is on Home (one tip at a time): it comes once that is put away
  await expect(page.getByRole('region', { name: 'How booking works' })).toBeVisible()
  await expect(page.getByText('Shine Unisex Salon').first()).toBeVisible()
  await expect(hint).toBeHidden()
  await page.getByRole('region', { name: 'How booking works' }).getByRole('button', { name: 'Got it' }).click()
  await page.reload()
  await expect(hint).toBeVisible()
  await hint.getByRole('link', { name: 'Save a place' }).click()
  await expect(page).toHaveURL(/\/places$/)
  await page.goto('/')
  await page.getByRole('note').filter({ hasText: 'Save Home or Work once' }).getByRole('button', { name: 'Got it' }).click()
  await page.reload()
  await expect(page.getByText('Shine Unisex Salon').first()).toBeVisible()
  await expect(hint).toBeHidden()
})

test("a salon's shared link opened signed out: sign-in says why, then the salon opens", async ({ page, api }) => {
  await page.goto('/salons/s1')
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeVisible()
  api.user = { ...api.user, name: 'Riya Sharma', email: 'riya@example.com', emailVerified: true }
  await page.getByLabel('Mobile number').fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/salons\/s1$/)
  await expect(page.getByRole('heading', { name: 'Shine Unisex Salon' })).toBeVisible()
})

test('a new customer from a shared link: name first, then the salon', async ({ page, api }) => {
  expect(api.user.name).toBeNull()
  await page.goto('/salons/s1')
  await page.getByLabel('Mobile number').fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/welcome\/name$/)
  // Help while giving the name goes to Contact (Need help needs a finished account)
  await expect(help(page)).toHaveAttribute('href', '/contact')
  await page.getByLabel('Your name').fill('Riya Sharma')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/salons\/s1$/)
})

test('plain sign-in (no link) says nothing about a salon', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.getByLabel('Mobile number')).toBeVisible()
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeHidden()
})

/** Opens an address inside the running app (no reload), as a link tapped in the installed app does. */
async function openInApp(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/** Signs in on the sign-in screen as the complete user (code 123456). */
async function signInHere(page: Page) {
  await page.getByLabel('Mobile number').fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
}

test('a salon link opened with a session that has ended (refused at start-up): sign-in still lands on that salon', async ({ page, context, api }) => {
  await signedIn(context, api)
  for (const t of api.refreshTokens.keys()) api.refreshTokens.set(t, 'revoked')
  await page.goto('/salons/s1')
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeVisible()
  await signInHere(page)
  await expect(page).toHaveURL(/\/salons\/s1$/)
})

test("the session ends while a salon's page is open (signed out in another tab): the next person starts at Home", async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await expect(page.getByRole('heading', { name: 'Shine Unisex Salon' })).toBeVisible()
  const other = await context.newPage()
  await other.goto('/profile')
  await other.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(other).toHaveURL(/\/signin$/)
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeHidden()
  await signInHere(page)
  await expect(page).toHaveURL(/\/$/)
})

test('signed out in this tab, then a salon link opened inside the app: the next sign-in starts at Home', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await openInApp(page, '/salons/s1')
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeHidden()
  await signInHere(page)
  await expect(page).toHaveURL(/\/$/)
})

test('a shared phone: a salon link opened signed out but never signed in is forgotten after 30 minutes', async ({ page, api }) => {
  api.user = { ...api.user, name: 'Riya Sharma', email: 'riya@example.com', emailVerified: true }
  await page.goto('/salons/s1')
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeVisible()
  // The phone is put down; the next person picks it up 31 minutes later
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ad.returnTo')!) as { path: string; at: number }
    localStorage.setItem('ad.returnTo', JSON.stringify({ ...saved, at: saved.at - 31 * 60_000 }))
  })
  await page.reload()
  await expect(page.getByLabel('Mobile number')).toBeVisible()
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeHidden()
  await signInHere(page)
  await expect(page).toHaveURL(/\/$/)
  expect(await page.evaluate(() => localStorage.getItem('ad.returnTo'))).toBeNull()
})

test('signed out in this tab, then any other screen: the next sign-in still starts at Home', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.bookings.push(api.makeBooking('b1', ['v1'], istInstant(addDays(todayIst(), 1), '10:00')))
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await openInApp(page, '/bookings/b1')
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText('Sign in to book at the salon you opened.', { exact: false })).toBeHidden()
  await page.getByLabel('Mobile number').fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
})

/** Signed in with a name but the email still pending: Home's Verify email banner shows (a brand-new customer). */
async function newCustomer(context: import('@playwright/test').BrowserContext, api: import('./mockApi').MockApi) {
  await signedIn(context, api)
  api.user = { ...api.user, email: null, emailVerified: false }
  const session = api.savedSession()
  await context.addInitScript((s) => {
    if (localStorage.getItem('e2e.pending')) return
    localStorage.setItem('e2e.pending', '1')
    localStorage.setItem('ad.session', s)
  }, session)
}

for (const lang of ['en', 'hi'] as const) {
  test(`a new customer's first screen at 360×640 (${lang}): the search box and the first salon, under the greeting, banner and How booking works`, async ({ page, context, api }) => {
    await newCustomer(context, api)
    if (lang === 'hi') await context.addInitScript(() => localStorage.setItem('language', 'hi'))
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.getByRole('link', { name: lang === 'hi' ? 'अभी वेरिफ़ाई करें' : 'Verify now' })).toBeVisible()
    await expect(page.locator('#how-it-works')).toBeVisible()
    const search = page.getByRole('searchbox')
    await expect(search).toBeInViewport({ ratio: 1 })
    // The first salon's card starts above the tab bar, with its name and rating showing (at least 40 px of it)
    await expect(page.locator('a[data-index="0"]')).toBeVisible()
    const tabs = (await page.locator('nav').last().boundingBox())!
    const first = (await page.locator('a[data-index="0"]').boundingBox())!
    expect(first.y + 40).toBeLessThanOrEqual(tabs.y)
    expect((await search.boundingBox())!.y + 48).toBeLessThanOrEqual(tabs.y)
    // No places tip on top of it while How booking works shows
    await expect(page.getByRole('note')).toHaveCount(0)
  })
}

test('Confirm booking shows the rules under Book now, also for someone who came from a salon link', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  const rules = page.getByText('Free to cancel until 1 hour before. 3 missed or late-cancelled bookings in 60 days pause online booking for 30 days.')
  await expect(rules).toBeVisible()
  const button = (await page.getByRole('button', { name: 'Book now' }).boundingBox())!
  expect((await rules.boundingBox())!.y).toBeGreaterThan(button.y)
})

test('online booking paused: "Missed by mistake? Write to us" opens the form with the subject and until when', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.blockedUntil = istInstant(addDays(todayIst(), 20), '09:30')
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^11:30 AM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page.getByText(/Online booking is paused for you/)).toBeVisible()
  await page.getByRole('link', { name: 'Missed by mistake? Write to us' }).click()
  await expect(page).toHaveURL(/\/help\?/)
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('A booking marked missed')
  await expect(page.locator('#help-message')).toHaveValue(/Online booking is paused for me until .*9:30 AM\. I think a booking was marked missed by mistake\./)
})

test('the "missed" answer says it is automatic, and Take me there opens the form about a missed booking', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/help')
  await page.getByRole('button', { name: 'What if I miss a booking?' }).click()
  await expect(page.getByText(/is marked missed automatically\. Show your code as soon as you arrive\./)).toBeVisible()
  await page.getByRole('button', { name: 'Take me there →' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('A booking marked missed')
  await expect(page.getByLabel("What's it about? (optional)")).toBeFocused()
})

test('"Take me there" opens each screen: saved addresses, Profile at the messages, deleting the account', async ({ page, context, api }) => {
  await signedIn(context, api)
  for (const [question, url] of [
    ['How do I save my Home or Work address?', /\/places$/],
    ['How do offer messages work?', /\/profile#messages$/],
    ['How do I delete my account?', /\/profile\/delete$/],
  ] as const) {
    await page.goto('/help')
    await page.getByRole('button', { name: question }).click()
    await page.getByRole('button', { name: 'Take me there →' }).click()
    await expect(page).toHaveURL(url)
  }
  await expect(page.getByRole('heading', { name: 'Delete account' })).toBeVisible()
})

test('Help says "मदद" in Hindi, on Home and in the title bars', async ({ page, context, api }) => {
  await signedIn(context, api)
  await context.addInitScript(() => localStorage.setItem('language', 'hi'))
  for (const path of ['/', '/bookings', '/profile']) {
    await page.goto(path)
    await expect(page.getByRole('link', { name: /^मदद/ })).toBeVisible()
  }
})

test('/help when My requests can not be read (offline, server down): Write to us, the card and the answers still show', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.route('**/api/v1/helpdesk/tickets', (route) => route.abort('internetdisconnected'))
  await page.goto('/help')
  await expect(page.getByRole('button', { name: 'Write to us' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^My requests/ })).toContainText('Your questions to us and our replies')
  await page.getByRole('button', { name: 'Until when can I cancel for free?' }).click()
  await expect(page.getByText(/Cancelling is free until 1 hour before the start/)).toBeVisible()
})

test("a salon's booking steps (/book, /confirm) open when the session ended are not kept for the next person", async ({ page, context, api }) => {
  await signedIn(context, api)
  for (const step of ['book', 'confirm'] as const) {
    await page.goto('/salons/s1')
    await page.getByLabel(/Haircut/).check()
    await page.getByRole('button', { name: 'Pick a time' }).click()
    if (step === 'confirm') {
      await page.getByRole('button', { name: 'Tomorrow' }).click()
      await page.getByRole('button', { name: /^11:30 AM to / }).click()
      await page.getByRole('button', { name: /Continue with/ }).click()
    }
    await expect(page).toHaveURL(new RegExp(`/salons/s1/${step}$`))
    const other = await context.newPage()
    await other.goto('/profile')
    await other.getByRole('button', { name: 'Sign out', exact: true }).click()
    // The sign-out is saved before that tab closes (closing it at once can beat the save, and then this tab never hears)
    await expect(other).toHaveURL(/\/signin$/)
    await other.close()
    await expect(page).toHaveURL(/\/signin$/)
    expect(await page.evaluate(() => localStorage.getItem('ad.returnTo'))).toBeNull()
    await signInHere(page)
    await expect(page).toHaveURL(/\/$/)
  }
})
