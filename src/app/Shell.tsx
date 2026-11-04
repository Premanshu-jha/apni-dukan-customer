import { NavLink, Outlet } from 'react-router'

const tabs = [
  { to: '/', label: 'Home', icon: '⌂', end: true },
  { to: '/bookings', label: 'Bookings', icon: '▤', end: false },
  { to: '/profile', label: 'Profile', icon: '◉', end: false },
]

/** The signed-in app: the screen, with the bottom bar. */
export function Shell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <nav
        aria-label="Main"
        className="sticky bottom-0 z-20 grid grid-cols-3 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-brand' : 'text-muted'}`
            }
          >
            <span aria-hidden className="text-lg leading-none">
              {t.icon}
            </span>
            {t.label}
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
      <Outlet />
    </div>
  )
}
