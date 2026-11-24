/**
 * The Play Store app's ways in from outside the screens: a tapped notification and a link to clozest.in (a salon's page)
 * that Android opened in the app. They can arrive before the router is drawn (the app opened from closed by the tap), so
 * the screen to open waits here until NativeBridge takes it.
 */

let pending: string | null = null
const listeners = new Set<() => void>()

/** Ask for this screen to open (replaces one still waiting: the newest tap wins). */
export function openInApp(path: string) {
  pending = path
  listeners.forEach((l) => l())
}

/** The screen waiting to open, taken once. */
export function takePendingOpen(): string | null {
  const p = pending
  pending = null
  return p
}

export function onOpenRequest(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * The screen a tapped notification opens, by the same rule as the website's service worker (public/sw.js): the
 * message's own page of this app (a booking, a support request), never another site; none given: My bookings.
 */
export function notificationTarget(url: string | null): string {
  let target: URL
  try {
    target = new URL(url || '/bookings', 'https://app.invalid')
  } catch {
    return '/bookings'
  }
  if (target.origin !== 'https://app.invalid') return '/bookings'
  return target.pathname + target.search + target.hash
}

/**
 * The screen for a link Android opened in the app (https://clozest.in/..., the app's own website: a salon's link shared on WhatsApp): the same
 * path, query and hash. Anything else (another site) opens nothing.
 */
export function linkTarget(url: string, ownHost: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.host !== ownHost) return null
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}
