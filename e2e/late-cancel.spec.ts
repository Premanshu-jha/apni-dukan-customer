import { addDays, istInstant, todayIst } from './mockApi'
import { expect, signedIn, test } from './helpers'

/** Free and late cancels: the warning on Confirm, "Free to cancel until …" on the booking (BookingService.lateCancelFrom). */

const clock = (ms: number) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))

/** The India date and "HH:mm" of the first quarter hour at least `minutes` from now (step: 1 for any minute). */
function quarterAfter(minutes: number, step = 15): { date: string; time: string; at: number } {
  const q = step * 60_000
  const at = Math.ceil((Date.now() + minutes * 60_000) / q) * q
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(at))
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, at }
}

test('a time within the hour: Confirm warns it can\'t be moved and is free to cancel for 10 minutes only', async ({ page, context, api }) => {
  await signedIn(context, api)
  const soon = quarterAfter(45) // 45 to 60 minutes away
  api.extraTimes.push({ date: soon.date, time: soon.time })
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  if (soon.date !== todayIst()) await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: new RegExp(`^${clock(soon.at)} to `) }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  const warning = page.getByText(/can't be moved\. Cancelling more than 10 minutes after booking counts as a late cancel/)
  await expect(warning).toBeVisible()
  const before = Date.now()
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1/)
  // 10 minutes after booking (later than 1 hour before the start)
  const lateFrom = Date.parse(api.bookings[0].lateCancelFrom as string)
  expect(lateFrom).toBeGreaterThanOrEqual(before + 10 * 60_000 - 1000)
  await expect(page.getByText(`Free to cancel until`)).toContainText(clock(lateFrom))
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText('counts as a late cancel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Yes, cancel it' }).click()
  await expect(page.getByText('Cancelled.', { exact: true })).toBeVisible()
})

test('a time hours away: no warning, free to cancel until 1 hour before the start', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: /^1:00 PM to / }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByRole('button', { name: 'Book now' })).toBeVisible()
  await expect(page.getByText(/can't be moved/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Book now' }).click()
  await expect(page).toHaveURL(/\/bookings\/b1/)
  await expect(page.getByText('Free to cancel until')).toContainText('12:00 PM')
  const start = istInstant(addDays(todayIst(), 1), '13:00')
  expect(api.bookings[0].lateCancelFrom).toBe(new Date(Date.parse(start) - 3600_000).toISOString())
})

test('past its lateCancelFrom: the booking says cancelling now is late, and the cancel counts', async ({ page, context, api }) => {
  await signedIn(context, api)
  const start = quarterAfter(40) // 40 to 55 minutes away
  const b = api.makeBooking('b1', ['v1'], istInstant(start.date, start.time), new Date(Date.now() - 20 * 60_000).toISOString())
  api.bookings.push(b)
  await page.goto('/bookings/b1')
  await expect(page.getByText('Cancelling now counts as a late cancel.')).toBeVisible()
  await expect(page.getByText('Free to cancel until')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText(/so this counts as a late cancel/)).toBeVisible()
  await page.getByRole('button', { name: 'Yes, cancel it' }).click()
  await expect(page.getByText('Cancelled. This was counted as a late cancel.')).toBeVisible()
})

test('a time just over an hour away: Confirm says until when it can be moved, and until when cancelling is free', async ({ page, context, api }) => {
  await signedIn(context, api)
  const start = quarterAfter(64, 1) // 64 to 65 minutes away
  api.extraTimes.push({ date: start.date, time: start.time })
  await page.goto('/salons/s1')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  if (start.date !== todayIst()) await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: new RegExp(`^${clock(start.at)} to `) }).click()
  await page.getByRole('button', { name: /Continue with/ }).click()
  const warning = page.getByText(/starts in just over an hour/)
  await expect(warning).toContainText(`You can move it until ${clock(start.at - 3600_000)}`)
  await expect(warning).toContainText('and cancel it for free until')
  await expect(page.getByText(/can't be moved/)).toHaveCount(0)
})
