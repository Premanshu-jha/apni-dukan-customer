import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Loading } from '../components/ui'
import { forgetReturn, nextAfterSignIn, rememberReturn } from '../features/auth/flow'
import { missingSteps, useSession } from '../store/session'

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
  if (missingSteps(user).length === 0) return <Navigate to={nextAfterSignIn(user)} replace />
  return <Outlet />
}

/**
 * Everything else: signed in with phone, email and name done. The backend needs the same before booking
 * (403 PROFILE_INCOMPLETE), and every salon screen needs a signed-in session.
 */
export function SignedIn() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  const endedHere = useSession((s) => s.endedHere)
  const location = useLocation()
  const ready = status === 'signedIn' && user !== null && missingSteps(user).length === 0
  useEffect(() => {
    if (ready) forgetReturn()
  }, [ready])
  if (status === 'starting') return <Loading />
  if (status !== 'signedIn' || !user) {
    // Coming from a link: come back here after sign-in. Just signed out here: the next person starts at Home.
    if (!endedHere) rememberReturn(location.pathname + location.search)
    return <Navigate to="/signin" replace />
  }
  const missing = missingSteps(user)
  if (missing.length) {
    rememberReturn(location.pathname + location.search)
    return <Navigate to={`/welcome/${missing[0]}`} replace />
  }
  return <Outlet />
}
