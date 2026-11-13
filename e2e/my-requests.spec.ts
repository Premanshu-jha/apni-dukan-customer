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

test('a photo and a video go with a message; Send waits for them; the request shows both', async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('CUSTOMER', 'Bad haircut', 'The barber cut it too short.')
  await page.goto(`/help/requests/${t.id}`)
  api.ticketFiles.putDelayMs = 800
  await page.locator('#request-files').setInputFiles([
    { name: 'IMG_2041.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]) },
    { name: 'cut.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(2048) },
  ])
  const files = page.getByRole('list', { name: 'Files to send' })
  await expect(files.getByText('IMG_2041.jpg', { exact: true })).toBeVisible()
  await expect(page.getByText('Send works once your files have finished uploading.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled()
  await expect(files.getByText(/Attached/)).toHaveCount(2)
  // Words are optional with a file
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Sent. Our support team will read it and reply.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Files to send' })).toBeHidden()
  const sent = page.getByRole('list', { name: 'Conversation' }).getByRole('list', { name: 'Files' })
  await expect(sent.getByRole('img', { name: 'IMG_2041.jpg' })).toBeVisible()
  await expect(sent.locator('video')).toHaveCount(1)
  expect(t.messages[t.messages.length - 1].files).toHaveLength(2)
})

test('a file that fails can be tried again or removed; any kind of file goes, to download', async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('CUSTOMER', 'Bill', 'Here is the bill for my booking.')
  await page.goto(`/help/requests/${t.id}`)
  await page.locator('#request-files').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })
  await expect(page.getByRole('list', { name: 'Files to send' }).getByText(/Attached/)).toBeVisible()
  api.ticketFiles.failNext = { status: 413, code: 'FILE_TOO_LARGE', message: 'A file can be at most 10 MB (a video 100 MB). Send a smaller one, or a screenshot of it.' }
  await page.locator('#request-files').setInputFiles({ name: 'bill.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') })
  await expect(page.getByText('A file can be at most 10 MB (a video 100 MB). Send a smaller one, or a screenshot of it.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('list', { name: 'Files to send' }).getByText(/Attached/)).toHaveCount(2)
  await page.getByLabel('Add to your request').fill('The bill')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('link', { name: /bill\.pdf/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download bill.pdf' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Download notes\.txt, TXT file/ })).toHaveAttribute('href', /download=1/)
})

test('a new question goes with a photo; signing out forgets what was typed', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/help')
  await page.getByLabel('Your message').fill('The salon was closed when I arrived.')
  await page.locator('#help-files').setInputFiles({ name: 'door.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) })
  await expect(page.getByText(/Attached/)).toBeVisible()
  await page.getByRole('button', { name: 'Send to support' }).click()
  await page.getByRole('button', { name: 'See it in My requests' }).click()
  await expect(page.getByRole('img', { name: 'door.jpg' })).toBeVisible()

  await page.getByLabel('Add to your request').fill('Half-written thought')
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ad.requestDraft.')))
  expect(keys.length).toBe(1)
  await page.evaluate(() => localStorage.setItem('ad.helpDraft.u1', JSON.stringify({ subject: '', message: 'x' })))
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('Draft.')).length)).toBe(0)
})

test("an iPhone's HEIC photo this browser can't read goes as a file, and a 6th file is named, not added", async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('CUSTOMER', 'Photo', 'About the photo of my haircut.')
  await page.goto(`/help/requests/${t.id}`)
  await page.locator('#request-files').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not a real heic') })
  await expect(page.getByRole('list', { name: 'Files to send' }).getByText(/^Attached as a file \(it can't be shown here, only downloaded\)/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Files to send' }).locator('img')).toHaveCount(0)   // no broken picture
  await page.getByRole('button', { name: 'Remove IMG_0001.HEIC' }).click()
  await expect(page.getByRole('button', { name: '📎 Add photo, video or file' })).toBeFocused()

  const pdf = (n: number) => ({ name: `bill${n}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') })
  await page.locator('#request-files').setInputFiles([1, 2, 3, 4, 5, 6].map(pdf))
  await expect(page.getByText("At most 5 files in one message, so bill6.pdf wasn't added: send it in the next one.")).toBeVisible()
  await expect(page.getByRole('list', { name: 'Files to send' }).getByRole('listitem')).toHaveCount(5)
})

test('a request written by email shows the files we brought in, and says how many stay only in that email', async ({ page, context, api }) => {
  await signedIn(context, api)
  const t = api.newTicket('EMAIL', 'Bill', 'Here is the bill, and a Word file.')
  t.messages[0].files = [{ id: 'e1', contentType: 'application/pdf', sizeBytes: 50000, name: 'bill.pdf', url: 'https://api.test/ticket-media/e1.pdf', removed: false }]
  t.messages[0].attachments = 1
  await page.goto(`/help/requests/${t.id}`)
  await expect(page.getByRole('link', { name: /bill\.pdf/ })).toBeVisible()
  await expect(page.getByText('📎 1 more file sent by email (only in that email: we see it there)')).toBeVisible()
})

test('an open request is read again every 30 s; a resolved one is not (thousands of open pages)', async ({ page, context, api }) => {
  await page.clock.install()
  await signedIn(context, api)
  const open = api.newTicket('CUSTOMER', 'Open one', 'Still waiting on this one.')
  const done = api.newTicket('CUSTOMER', 'Done one', 'This one was sorted out.')
  done.status = 'RESOLVED'
  let reads = 0
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().endsWith(`/helpdesk/tickets/${done.id}`)) reads++
  })
  await page.goto(`/help/requests/${done.id}`)
  await expect(page.getByText('This one was sorted out.')).toBeVisible()
  const first = reads
  await page.clock.fastForward('02:00')
  expect(reads).toBe(first)

  let openReads = 0
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().endsWith(`/helpdesk/tickets/${open.id}`)) openReads++
  })
  await page.goto(`/help/requests/${open.id}`)
  await expect(page.getByText('Still waiting on this one.')).toBeVisible()
  const before = openReads
  await page.clock.fastForward('00:35')
  await expect.poll(() => openReads).toBeGreaterThan(before)
})
