import type { User } from '../../api/types'
import { signUpSteps, useSession } from '../../store/session'
import { storage } from '../../lib/storage'

const RETURN_KEY = 'ad.returnTo'
/** Where the person was going when they were asked to verify their email (see EmailVerifiedOnly). */
const EMAIL_RETURN_KEY = 'ad.afterEmail'

/**
 * How long a remembered return is kept. A shared phone: someone opens a salon's link signed out, never signs in, and
 * puts the phone down; the next person to sign in, an hour later, must start at Home, not at that salon. Half an hour
 * is plenty to get a code and sign in (or give the name), so a return older than that is forgotten.
 */
export const RETURN_FOR_MS = 30 * 60_000

/** Remember where the person was going, so sign-in can bring them back there (for RETURN_FOR_MS). */
export function rememberReturn(path: string) {
  if (path.startsWith('/signin') || path.startsWith('/welcome')) return
  storage.setJson(RETURN_KEY, { path, at: Date.now() })
}

/** The return remembered, if it is still fresh (an older one is forgotten here; an old plain path too). */
function savedReturn(): string | null {
  const saved = storage.getJson<{ path?: unknown; at?: unknown }>(RETURN_KEY)
  const fresh = saved && typeof saved.path === 'string' && typeof saved.at === 'number' && Date.now() - saved.at < RETURN_FOR_MS
  if (!fresh) {
    if (storage.get(RETURN_KEY) !== null) storage.remove(RETURN_KEY)
    return null
  }
  return saved.path as string
}

/**
 * Whether sign-in will bring this person back to a salon's page: they opened a salon's link (one a salon shared,
 * clozest.in/salons/<id>) while signed out. The sign-in screen then says why they are asked to sign in. The salon's
 * name isn't known here: the backend shows a salon only to someone signed in.
 */
export function returningToSalon(): boolean {
  const back = savedReturn()
  return back !== null && /^\/salons\/[^/?#]+(\/(book|confirm))?\/?([?#].*)?$/.test(back)
}

/**
 * A salon's own page (the link a salon shares, clozest.in/salons/<id>). Its booking steps (/book, /confirm) are not:
 * they belong to the person who was booking.
 */
export function isSalonLink(path: string): boolean {
  return /^\/salons\/[^/?#]+\/?$/.test(path)
}

/** The screen this tab opened on (the link tapped, or the address typed), before the app moved anywhere. */
const FIRST_PATH = typeof window === 'undefined' ? '' : window.location.pathname
/** Whether anyone was signed in while this tab was open (a page they had open is theirs, not a link for the next). */
let signedInHere = useSession.getState().status === 'signedIn'
useSession.subscribe((s) => {
  if (s.status === 'signedIn') signedInHere = true
})

/**
 * A salon's link opened just now: the first screen of this tab, which nobody had open signed in. Sign-in still lands
 * there even though the session ended in this tab (a saved session refused at start-up: the link tapped is what this
 * person wants). Not the salon page the last person had open when their session ended (signed out in another tab,
 * the backend ending it): the next person starts at Home (see SignedIn in app/guards).
 */
export function isFreshSalonLink(path: string): boolean {
  return isSalonLink(path) && path.replace(/\/$/, '') === FIRST_PATH.replace(/\/$/, '') && !signedInHere
}

/** Forget the saved place once the person has arrived in the app. */
export function forgetReturn() {
  storage.remove(RETURN_KEY)
}

/** This tab's own storage (a booking in one tab and Need help in another each come back to their own screen). */
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Remember where this person was going when the app asked them to verify their email first, so verifying takes them
 * straight there (the booking screen with their salon, service and time still picked). Kept per tab, with whose it
 * is: someone else signing in on the phone never inherits it.
 */
export function rememberAfterEmail(path: string, userId: string | undefined) {
  if (!userId || path.startsWith('/signin') || path.startsWith('/welcome') || path.startsWith('/verify-email')) return
  try {
    tabStorage()?.setItem(EMAIL_RETURN_KEY, JSON.stringify({ userId, path }))
  } catch {
    /* storage blocked: verifying goes Home */
  }
}

/** Forget it: they left the email screen for later, chose to verify from Home or Profile, or signed out. */
export function forgetAfterEmail() {
  try {
    tabStorage()?.removeItem(EMAIL_RETURN_KEY)
  } catch {
    /* nothing to do */
  }
}

/** Where to go once the email is verified (once only): where this person was going, else Home. */
export function takeAfterEmail(userId: string | undefined): string {
  let saved: { userId?: string; path?: string } | null = null
  try {
    saved = JSON.parse(tabStorage()?.getItem(EMAIL_RETURN_KEY) ?? 'null')
  } catch {
    saved = null
  }
  forgetAfterEmail()
  const back = saved && saved.userId === userId ? saved.path : null
  return back && back.startsWith('/') && !back.startsWith('//') ? back : '/'
}

/**
 * Whether this person was sent to the email screen from a booking (a salon's time or confirm screen), without
 * forgetting where they were going: the email screen then says why booking stopped and that it comes back.
 */
export function cameFromBooking(userId: string | undefined): boolean {
  try {
    const saved = JSON.parse(tabStorage()?.getItem(EMAIL_RETURN_KEY) ?? 'null') as { userId?: string; path?: string } | null
    return Boolean(saved && userId && saved.userId === userId && /^\/salons\/[^/]+\/(book|confirm)(\?|$)/.test(saved.path ?? ''))
  } catch {
    return false
  }
}

/** Where to go after a sign-in step: the name if it's missing, else back to where they started (or Home). */
export function nextAfterSignIn(user: User): string {
  const missing = signUpSteps(user)
  if (missing[0] === 'name') return '/welcome/name'
  const back = savedReturn()
  return back && back.startsWith('/') && !back.startsWith('//') ? back : '/'
}
