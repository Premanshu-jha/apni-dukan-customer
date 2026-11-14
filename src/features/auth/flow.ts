import type { User } from '../../api/types'
import { signUpSteps } from '../../store/session'
import { storage } from '../../lib/storage'

const RETURN_KEY = 'ad.returnTo'
/** Where the person was going when they were asked to verify their email (see EmailVerifiedOnly). */
const EMAIL_RETURN_KEY = 'ad.afterEmail'

/** Remember where the person was going, so sign-in can bring them back there. */
export function rememberReturn(path: string) {
  if (path.startsWith('/signin') || path.startsWith('/welcome')) return
  storage.set(RETURN_KEY, path)
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
  const back = storage.get(RETURN_KEY)
  return back && back.startsWith('/') && !back.startsWith('//') ? back : '/'
}
