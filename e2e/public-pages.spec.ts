import { expect, signedIn, test } from './helpers'

test('a visitor opening the site sees About first, with Sign in on it; the sign-in screen links back to every page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { name: 'About Clozest' })).toBeVisible()
  await expect(page.getByText('Clozest is operated by Premanshu Jha, a sole proprietor.')).toBeVisible()
  await expect(page.getByText(/Booking is free for customers/)).toBeVisible()
  // Nothing about paying Clozest; salon owners are pointed to the partner app
  await expect(page.getByText(/₹/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Clozest for salons' })).toHaveAttribute('href', 'https://partner.clozest.in')
  // The front page has no Back (nothing before it)
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Sign in or sign up' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByRole('navigation', { name: 'About Clozest' }).getByRole('link', { name: 'Terms' }).click()
  await expect(page.getByRole('heading', { name: 'Terms of service' })).toBeVisible()
  // Back goes to the screen before it
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/signin$/)
})

test('someone who has signed in on this browser goes straight to sign-in at /, even after a reload (not About)', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()
  await page.goto('/profile')
  await expect(page.getByText('Riya Sharma')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  // A fresh load later (the installed app opens at /): still sign-in
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a saved session whose refresh is refused (expired, or from before this release): sign-in at /, even after a reload', async ({ page, context, api }) => {
  await signedIn(context, api)
  // The backend no longer knows the saved token (expired, or ended elsewhere)
  for (const t of api.refreshTokens.keys()) api.refreshTokens.set(t, 'revoked')
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a visit to / drops a path saved by an earlier visit, so signing up from About ends at Home', async ({ page, api }) => {
  await page.goto('/salons/s1')
  await expect(page).toHaveURL(/\/signin$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/about$/)
  expect(await page.evaluate(() => localStorage.getItem('ad.returnTo'))).toBeNull()
  void api
})

for (const [path, title] of [
  ['/about', 'About Clozest'],
  ['/contact', 'Contact us'],
  ['/terms', 'Terms of service'],
  ['/privacy', 'Privacy policy'],
] as const) {
  test(`opened straight from a link while signed out, ${path} shows (no sign-in first)`, async ({ page, api }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    // Nothing asks the backend for anything to show a public page (no session needed)
    expect(api.calls.filter((c) => !c.path.includes('/auth/refresh'))).toEqual([])
    if (path === '/about') {
      await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
    } else {
      // Nothing before it: Back goes to the front page, in its place, so the phone's Back doesn't loop back
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page).toHaveURL(/\/about$/)
      expect(await page.evaluate(() => (history.state as { idx?: number } | null)?.idx ?? 0)).toBe(0)
    }
  })
}

test('signed in: Profile links to the same pages, they open without signing out, and Back returns to Profile', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/profile')
  await page.getByRole('navigation', { name: 'About Clozest' }).getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByText('Riya Sharma')).toBeVisible()
})

test('signed in and opened from a link, Back from a public page goes Home', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of service' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/$/)
})
