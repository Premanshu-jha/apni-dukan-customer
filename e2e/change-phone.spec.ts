import { expect, signedIn, test } from './helpers'

test('changing the mobile number: a taken or same number is refused; the codes move the same account; this phone stays signed in', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.takenPhones.add('9700000005')
  await page.goto('/profile')
  await page.getByRole('link', { name: 'Change mobile number' }).click()
  const number = page.getByLabel('New mobile number')
  await number.fill('98480 12345')
  await expect(page.getByText('This is already your number.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send codes' })).toBeDisabled()
  await number.fill('9700000005')
  await page.getByRole('button', { name: 'Send codes' }).click()
  await expect(page.getByText('This number already has its own Clozest account. Use another number.')).toBeVisible()

  await number.fill('+91 97000 00003')
  await page.getByRole('button', { name: 'Send codes' }).click()
  await expect(page.getByText('We sent a code to +91 97000 00003 and one to riya@example.com.')).toBeVisible()
  await page.getByLabel('Code sent to your email').fill('654321')
  await page.getByLabel('Code sent to the new number').fill('111111')
  await page.getByRole('button', { name: 'Change number' }).click()
  await expect(page.getByText('That code is not right. 4 tries left.')).toBeVisible()
  await page.getByLabel('Code sent to the new number').fill('123456')
  await page.getByRole('button', { name: 'Change number' }).click()

  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByText(/Your mobile number is now \+91 97000 00003\. Other devices were signed out/)).toBeVisible()
  await expect(page.getByText('+91 97000 00003', { exact: true })).toBeVisible()
  const sent = api.calls.filter((c) => c.path === '/api/v1/auth/me/phone').at(-1)!
  expect(sent.body).toMatchObject({ newPhone: '9700000003', phoneCode: '123456', emailCode: '654321' })
  // Still signed in with the new tokens: other screens load
  await page.getByRole('link', { name: 'Bookings' }).first().click()
  await expect(page).toHaveURL(/\/bookings$/)
  await page.reload()
  await expect(page).toHaveURL(/\/bookings$/)
})

test('both codes are asked for (the email is verified); the other tab carries on with the new number', async ({ page, context, api }) => {
  await signedIn(context, api)
  const other = await context.newPage()
  await other.goto('/profile')
  await expect(other.getByText('+91 98480 12345', { exact: true })).toBeVisible()

  await page.goto('/profile/phone')
  await page.getByLabel('New mobile number').fill('9700000004')
  await page.getByRole('button', { name: 'Send codes' }).click()
  await expect(page.getByText(/and one to riya@example\.com/)).toBeVisible()
  await page.getByLabel('Code sent to the new number').fill('123456')
  await expect(page.getByRole('button', { name: 'Change number' })).toBeDisabled()
  await page.getByLabel('Code sent to your email').fill('654321')
  await page.getByRole('button', { name: 'Change number' }).click()
  await expect(page.getByText(/Your mobile number is now \+91 97000 00004/)).toBeVisible()

  // The other tab's old tokens are ended; it picks up the new pair and isn't signed out
  await other.reload()
  await expect(other).toHaveURL(/\/profile$/)
  await expect(other.getByText('+91 97000 00004', { exact: true })).toBeVisible()
})

test('the number taken between the code and the change goes back to the number step', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile/phone')
  await page.getByLabel('New mobile number').fill('9700000006')
  await page.getByRole('button', { name: 'Send codes' }).click()
  await page.getByLabel('Code sent to the new number').fill('123456')
  await page.getByLabel('Code sent to your email').fill('654321')
  api.takenPhones.add('9700000006')
  await page.getByRole('button', { name: 'Change number' }).click()
  await expect(page.getByText('This number got its own Clozest account meanwhile. Use another number.')).toBeVisible()
  await expect(page.getByLabel('New mobile number')).toBeVisible()
})
