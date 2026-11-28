import { languageChosen } from '../i18n'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Loading } from '../components/ui'
import { forgetReturn, isFreshSalonLink, nextAfterSignIn, rememberAfterEmail, rememberReturn } from '../features/auth/flow'
import { needsEmail, signedInHereBefore, signUpSteps, useSession } from '../store/session'

/** Screens for signed-out people only (sign-in); a signed-in person goes on to the app. */
export function SignedOutOnly() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  if (status === 'starting') return <Loading />
  // Same target as the sign-in step's own navigate, so the two never disagree.
  if (status === 'signedIn' && user) return <Navigate to={nextAfterSignIn(user)} replace />
  return <Outlet />
}

/** The sign-up steps after the phone code: signed in, profile not finished yet. */
export function FinishingProfile() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  if (status === 'starting') return <Loading />
  if (status !== 'signedIn' || !user) return <Navigate to="/signin" replace />
  if (signUpSteps(user).length === 0) return <Navigate to={nextAfterSignIn(user)} replace />
  return <Outlet />
}

/**
 * Everything else: signed in, name given. The email may still be pending: Home says so, and the screens that do
 * something sit behind EmailVerifiedOnly (the backend also refuses a booking without it: 403 PROFILE_INCOMPLETE).
 */
export function SignedIn() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  const endedHere = useSession((s) => s.endedHere)
  const location = useLocation()
  const ready = status === 'signedIn' && user !== null && signUpSteps(user).length === 0
  useEffect(() => {
    if (ready) forgetReturn()
  }, [ready])
  if (status === 'starting') return <Loading />
  if (status !== 'signedIn' || !user) {
    // A first-time visitor opening the site's address (clozest.in) sees what Clozest is first, with Sign in on it.
    // Anyone who has signed in on this browser before (signed out, session ended, the installed app) goes straight to
    // sign-in, as before. A path saved by an earlier visit is dropped, so sign-in from About ends at Home.
    if (location.pathname === '/' && !endedHere && !signedInHereBefore()) {
      forgetReturn()
      // A new phone: the language first (LanguageFirst), then About in it
      if (!languageChosen()) return <Navigate to="/language" replace state={{ next: '/about' }} />
      return <Navigate to="/about" replace />
    }
    // Coming from a link: come back here after sign-in. The session ended in this tab: the next person starts at
    // Home (the screen the last person was on isn't theirs, a salon's page included), except a salon's link this tab
    // was just opened with, nobody signed in on it yet (a saved session refused at start-up): that is where they go
    if (!endedHere || isFreshSalonLink(location.pathname)) rememberReturn(location.pathname + location.search)
    return <Navigate to="/signin" replace />
  }
  const missing = signUpSteps(user)
  if (missing.length) {
    rememberReturn(location.pathname + location.search)
    return <Navigate to={`/welcome/${missing[0]}`} replace />
  }
  return <Outlet />
}

/**
 * The screens that do something (book, save a place, change the profile, ask for help): only with a verified email.
 * While it's pending, the person goes to the email screen first and, once it's verified, straight back here (the
 * address they were going to, kept with rememberAfterEmail). Works for typed addresses and links too.
 */
export function EmailVerifiedOnly() {
  const user = useSession((s) => s.user)
  const location = useLocation()
  if (needsEmail(user)) {
    rememberAfterEmail(location.pathname + location.search, user?.id)
    return <Navigate to="/verify-email" replace />
  }
  return <Outlet />
}
