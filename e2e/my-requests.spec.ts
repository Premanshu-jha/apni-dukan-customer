import { expect, signedIn, test } from './helpers'

test('after sending, the request opens in My requests; support replies show; adding to it sends it back to support', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/help')
  await page.getByLabel("What's it about? (optional)").fill('Booking refund')
  await page.getByLabel('Your message').fill('My booking SB12 was cancelled by the salon.')
  await page.getByRole('button', { name: 'Send to support' }).click()
  await page.getByRole('button', { name: 'See it in My requests' }).click()
  await expect(page).toHaveURL(/\/help\/requests\/t1001$/)
  await expect(page.getByText('With our support team')).toBeVisible()
  await expect(page.getByText('My booking SB12 was cancelled by the salon.')).toBeVisible()

  api.supportReplies(api.tickets[0], 'Sorry about that. The salon confirms it, we have noted it.')
  await page.reload()
  await expect(page.getByText('Clozest support · Neha', { exact: false })).toBeVisible()
  await expect(page.getByText('We replied')).toBeVisible()

  // What's typed survives leaving; a double tap sends once
  await page.getByLabel('Add to your request').fill('Thanks, and will I get the money back?')
  await page.goto('/profile')
  await page.getByRole('link', { name: /My requests/ }).click()
  await expect(page.getByText('Booking refund')).toBeVisible()
  await page.getByText('Booking refund').click()
  await expect(page.getByLabel('Add to your request')).toHaveValue('Thanks, and will I get the money back?')
  await page.getByRole('button', { name: 'Send' }).dblclick()
  await expect(page.getByText('Sent. Our support team will read it and reply.')).toBeVisible()
  await expect(page.getByLabel('Add to your request')).toHaveValue('')
  expect(api.tickets[0].messages.filter((m) => !m.fromSupport)).toHaveLength(2)
  expect(api.tickets[0].status).toBe('OPEN')
})

test('a resolved request is opened again by writing; too many messages keep what was typed', async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('CUSTOMER', null, 'Where is my booking?')
  t.status = 'RESOLVED'
  await page.goto(`/help/requests/${t.id}`)
  await expect(page.getByRole('heading', { name: 'Your question' })).toBeVisible()
  await page.getByLabel('Write again (opens it again)').fill('It happened again today.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('With our support team')).toBeVisible()

  api.addedThisHour = 20
  await page.getByLabel('Add to your request').fill('One more thing.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(/You've written a lot in the last hour/)).toBeVisible()
  await expect(page.getByLabel('Add to your request')).toHaveValue('One more thing.')
})

test("no requests yet says how to ask; someone else's request is never shown", async ({ page, context, api }) => {
  await signedIn(context, api)
  const other = api.addOthersTicket()
  await page.goto('/help/requests')
  await expect(page.getByText('No requests yet')).toBeVisible()
  await expect(page.getByText('Not mine')).toBeHidden()
  await page.goto(`/help/requests/${other.id}`)
  await expect(page.getByText('Request not found')).toBeVisible()
  await expect(page.getByText('Another account asked this.')).toBeHidden()
  await page.goto('/help')
  await page.getByRole('link', { name: 'Asked before? See My requests and our replies' }).click()
  await expect(page).toHaveURL(/\/help\/requests$/)
})

test('the arrows never go round: list → request → list → Profile', async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('CUSTOMER', 'Booking refund', 'My booking SB12 was cancelled by the salon.')
  await page.goto('/profile')
  await page.getByRole('link', { name: /My requests/ }).click()
  await page.getByText('Booking refund').click()
  await expect(page).toHaveURL(new RegExp(`/help/requests/${t.id}$`))
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help\/requests$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  // Opened straight from a link: ← goes to the list, then Profile
  await page.goto(`/help/requests/${t.id}`)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help\/requests$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/profile$/)
})

test('a send whose answer was lost and is sent again is kept once', async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('CUSTOMER', 'Booking refund', 'My booking SB12 was cancelled by the salon.')
  await page.goto(`/help/requests/${t.id}`)
  await page.getByLabel('Add to your request').fill('Any news?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Sent. Our support team will read it and reply.')).toBeVisible()
  await expect(page.getByLabel('Add to your request')).toBeFocused()
  await page.getByLabel('Add to your request').fill('Any news?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByLabel('Add to your request')).toHaveValue('')   // the second send's answer came
  expect(t.messages.filter((m) => m.body === 'Any news?')).toHaveLength(1)
  // After support answered, the same words are a new message
  api.supportReplies(t, 'Which booking?')
  await page.reload()
  await page.getByLabel('Add to your request').fill('Any news?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByLabel('Add to your request')).toHaveValue('')
  expect(t.messages.filter((m) => m.body === 'Any news?')).toHaveLength(2)
})

test('"Support replied" is in the notifications and opens the request', async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('CUSTOMER', 'Booking refund', 'My booking SB12 was cancelled by the salon.')
  api.supportReplies(t, 'Sorry, we have noted it.')
  await page.goto('/notifications')
  await page.getByText('Support replied on CLZ-1001').click()
  await expect(page).toHaveURL(new RegExp(`/help/requests/${t.id}$`))
  await expect(page.getByText('Sorry, we have noted it.')).toBeVisible()
})
