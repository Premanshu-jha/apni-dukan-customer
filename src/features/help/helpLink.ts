import { signUpSteps, useSession } from '../../store/session'

/** The screens that are themselves the help: no Help button there (it would only open the same page again). */
export function isHelpScreen(pathname: string): boolean {
  return pathname === '/help' || pathname.startsWith('/help/') || pathname === '/contact'
}

/**
 * What the screen is about, as the subject Need help starts with when it was opened from that screen's Help button
 * (a screen that knows more, such as a salon or a booking, says so itself). Only a starting point: whatever the person
 * already typed in Need help is never replaced (see NeedHelp's `keep`).
 */
export function screenSubject(pathname: string, t: (key: string) => string): string | undefined {
  if (pathname === '/') return t('guide.aboutHome')
  if (pathname === '/bookings') return t('guide.aboutBookings')
  if (pathname === '/places' || pathname.startsWith('/places/')) return t('guide.aboutPlaces')
  if (pathname === '/profile/phone') return t('guide.aboutPhone')
  if (pathname === '/profile/email') return t('guide.aboutEmail')
  if (pathname === '/profile/delete') return t('guide.aboutDelete')
  if (pathname === '/profile') return t('guide.aboutAccount')
  if (pathname === '/notifications') return t('guide.aboutMessages')
  if (pathname === '/verify-email') return t('guide.aboutVerifyEmail')
  return undefined
}

/**
 * Where help is for this person: signed in with the profile done, Need help (its answers, and writing to us); signed
 * out or still giving the name, the public Contact page (Need help needs an account to reply to).
 */
export function useHelpLink(about?: string, text?: string): string {
  const ready = useSession((s) => s.status === 'signedIn' && s.user !== null && signUpSteps(s.user).length === 0)
  if (!ready) return '/contact'
  const params = new URLSearchParams()
  if (about) params.set('about', about)
  if (text) params.set('text', text)
  // keep: fill only what is empty; a draft the person typed earlier stays as it is
  if (about || text) params.set('keep', '1')
  const query = params.toString()
  return query ? `/help?${query}` : '/help'
}
