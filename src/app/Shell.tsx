import { NavLink, Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useT } from '../i18n'

/** Each tab's label is the key of its words (translated when drawn, so it follows the language). */
const tabs = [
  { to: '/', label: 'app.tabHome', icon: '⌂', end: true },
  { to: '/bookings', label: 'app.tabBookings', icon: '▤', end: false },
  { to: '/profile', label: 'app.tabProfile', icon: '◉', end: false },
]

/** The signed-in app: the screen, with the bottom bar. */
export function Shell() {
  const t = useT()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <div className="flex flex-1 flex-col">
        <Screen />
      </div>
      <nav
        aria-label={t('app.navMain')}
        className="sticky bottom-0 z-20 grid grid-cols-3 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-link' : 'text-muted'}`
            }
          >
            <span aria-hidden className="text-lg leading-none">
              {tab.icon}
            </span>
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** Sign-in and full-screen steps: no bottom bar. */
export function Bare() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <Screen />
    </div>
  )
}

/** The screen of the route, inside its own error boundary: a new address starts it afresh. */
function Screen() {
  const { pathname, state } = useLocation()
  // Just verified the email on the way here (a booking, Need help, Home): say it worked, on whatever screen this is
  const verified = (state as { emailVerified?: boolean } | null)?.emailVerified === true
  const t = useT()
  return (
    <ErrorBoundary key={pathname}>
      {verified && (
        <p role="status" className="mx-4 mt-3 rounded-xl border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">
          {t('app.emailVerified')}
        </p>
      )}
      <Outlet />
    </ErrorBoundary>
  )
}
