import { test as base, expect, type BrowserContext } from '@playwright/test'
import { MockApi } from './mockApi'

/**
 * Every test gets its own fake backend, attached to the browser context, and fails if the page's
 * Content-Security-Policy blocked anything (`vite preview` sends the production headers, so the tests run under it).
 */
export const test = base.extend<{ api: MockApi; cspClean: void }>({
  api: async ({ context }, use) => {
    const api = new MockApi()
    await api.attach(context)
    await use(api)
  },
  cspClean: [
    async ({ context }, use) => {
      const blocked: string[] = []
      context.on('console', (m) => {
        if (/Content Security Policy/i.test(m.text())) blocked.push(m.text())
      })
      await use()
      expect(blocked, 'blocked by the Content-Security-Policy').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

/** Starts the test already signed in with a complete profile (and, unless told otherwise, a saved location). */
export async function signedIn(context: BrowserContext, api: MockApi, opts: { location?: boolean } = {}) {
  api.user = MockApi.completeUser()
  const session = api.savedSession()
  const withLocation = opts.location !== false
  await context.addInitScript(
    ([s, loc]) => {
      // Once per test (shared by all its tabs), so a reload or a second tab doesn't put the old token back.
      if (localStorage.getItem('e2e.seeded')) return
      localStorage.setItem('e2e.seeded', '1')
      localStorage.setItem('ad.session', s)
      if (loc) localStorage.setItem('ad.location', JSON.stringify({ lat: 28.627, lng: 77.372, accuracy: 30, at: Date.now() }))
    },
    [session, withLocation] as const,
  )
}
