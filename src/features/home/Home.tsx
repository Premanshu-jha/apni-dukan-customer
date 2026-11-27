import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { chosenOf, useAddressNear, usePlaces } from '../../api/places'
import { useLocation as useLocationStore, ROUGH_METRES, type ChosenPlace } from '../../store/location'
import { Banner, Page } from '../../components/ui'
import { useSession } from '../../store/session'
import { LocationGate } from '../location/LocationGate'
import { Bell } from '../notifications/Bell'
import { SalonList } from '../salon/SalonList'
import { VerifyEmailBanner } from '../auth/VerifyEmailBanner'
import { type CategoryId, shownCategories } from './categories'
import { greeting } from '../../lib/ist'
import { YourBooking } from './YourBooking'
import { HomeVisitTip, HowItWorks, SaveHomeOffer } from '../guide/HomeGuide'
import { PlaceChips } from '../places/PlaceChips'
import { HelpButton } from '../help/HelpButton'
import { useT } from '../../i18n'
import { isApp } from '../../lib/platform'
import { ROUGH_PIN_METRES } from '../../lib/addressPin'

/**
 * Home: a greeting by the time of day in India, the verify-your-email banner while the email is pending, the
 * customer's next booking with "Book again" (see YourBooking), the live categories (no tabs while only Salon is
 * open), then the salons near the customer.
 */
export function Home() {
  const t = useT()
  const name = useSession((s) => s.user?.name)
  const shown = shownCategories()
  const [tab, setTab] = useState<CategoryId>(shown[0].id)
  const chosen = useChosenPlace()
  const hello = useGreeting()
  const first = name?.trim().split(/\s+/)[0]

  return (
    <Page>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-bold min-[400px]:text-2xl">{first ? t('home.greetingWithName', { greeting: hello, name: first }) : hello}</h1>
          <p className="text-muted">{t('home.subtitle')}</p>
        </div>
        {/* Help beside the bell (Home has no title bar to carry it) */}
        <div className="flex shrink-0 items-center gap-2">
          <HelpButton />
          <Bell />
        </div>
      </div>
      <VerifyEmailBanner compact />
      <YourBooking />
      {/* First-time guide: how booking works (never booked), or the salon messages after a first visit */}
      <HowItWorks />
      <HomeVisitTip />
      {/* Tabs only once a second category is open */}
      {shown.length > 1 && (
      <div role="tablist" aria-label={t('home.categoriesLabel')} className="grid grid-cols-3 gap-2">
        {shown.map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={tab === c.id}
            onClick={() => setTab(c.id)}
            className={`relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border text-sm transition ${tab === c.id ? 'border-brand bg-brand/10 text-ink' : 'border-line bg-surface text-muted'}`}
          >
            <span aria-hidden className="text-2xl">
              {c.icon}
            </span>
            {c.label}
          </button>
        ))}
      </div>
      )}
      {/* Only Salon has screens yet; another category opened later brings its own here */}
      {tab === 'salon' && (
        <>
          <PlaceChips />
          <SwitchedNote />
        </>
      )}
      {tab === 'salon' && chosen ? (
        <>
          <PlaceBar chosen={chosen} />
          <SalonList lat={chosen.lat} lng={chosen.lng} />
        </>
      ) : tab === 'salon' ? (
        <LocationGate>
          {(place) => (
            <>
              <LocationBar />
              {/* Only for a fix close enough to be "home" (the pin's own bar, not the list's) */}
              {place.accuracy <= ROUGH_PIN_METRES && <SaveHomeOffer />}
              {place.accuracy > ROUGH_METRES && (
                <Banner tone="warn">
                  {t('home.roughLocation', { km: Math.round(place.accuracy / 1000) })}
                </Banner>
              )}
              <SalonList lat={place.lat} lng={place.lng} />
            </>
          )}
        </LocationGate>
      ) : null}
    </Page>
  )
}

/**
 * After the customer switched where to find salons (a chip, the place list, a place just saved): once, for a few
 * seconds, "Showing salons near Work", so it is plain the list below changed. A note floating above the tab bar (the
 * list doesn't jump); the words go into the live region only after Home has drawn, so screen readers say them also
 * when Home opens with them (from the place list). Leaving Home forgets it; not said for the current location when
 * the phone has none (the gate asks for it instead).
 */
function SwitchedNote() {
  const t = useT()
  const switched = useLocationStore((s) => s.switched)
  const clearSwitched = useLocationStore((s) => s.clearSwitched)
  const hasGps = useLocationStore((s) => s.place !== null)
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    if (switched === null) return
    const text = switched ? t('home.showingNear', { place: switched }) : hasGps ? t('home.showingNearCurrent') : null
    const shown = window.requestAnimationFrame(() => setSaid(text))
    const timer = window.setTimeout(() => {
      clearSwitched()
      setSaid(null)
    }, SWITCHED_NOTE_MS)
    return () => {
      window.cancelAnimationFrame(shown)
      window.clearTimeout(timer)
    }
  }, [switched, hasGps, clearSwitched, t])
  // Leaving Home before it went: not said again on coming back
  useEffect(() => () => clearSwitched(), [clearSwitched])
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 empty:hidden">
      {said && (
        <p className="rounded-full border border-good/40 bg-bg px-4 py-2 text-sm font-medium text-good shadow-lg">{said}</p>
      )}
    </div>
  )
}

/** GPS this close needs no "accurate to" on the bar. */
const PRECISE_METRES = 100

/** How long "Showing salons near …" stays. */
const SWITCHED_NOTE_MS = 4000

/** "Change ▾" drawn as a button, so the bar plainly opens something. */
function ChangePill() {
  const t = useT()
  return (
    <span className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-brand px-3 text-sm font-semibold text-link">
      {t('common.change')}
      <span aria-hidden>▾</span>
    </span>
  )
}

/**
 * "Good morning" and so on, by the clock in India: worked out when Home opens and again whenever the app comes back
 * to the front (an app left open since the morning says "Good evening" when picked up at 6 PM).
 */
function useGreeting(): string {
  const [hello, setHello] = useState(() => greeting())
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') setHello(greeting())
    }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [])
  return hello
}

/**
 * The saved place salons are found near, kept in step with the saved list: changed there (or on another phone), its
 * pin follows; deleted, the choice goes back to the current location. Offline or still loading: the copy kept.
 */
function useChosenPlace(): ChosenPlace | null {
  const chosen = useLocationStore((s) => s.chosen)
  const choose = useLocationStore((s) => s.choose)
  const places = usePlaces()
  const saved = chosen && places.data ? places.data.find((p) => p.id === chosen.id) : undefined
  const gone = chosen !== null && places.data !== undefined && !saved
  const fresh = saved ? chosenOf(saved) : null
  const changed =
    fresh !== null &&
    chosen !== null &&
    (fresh.lat !== chosen.lat || fresh.lng !== chosen.lng || fresh.label !== chosen.label || fresh.short !== chosen.short)
  useEffect(() => {
    if (gone) choose(null)
    else if (changed && fresh) choose(fresh)
  }, [gone, changed, fresh, choose])
  return gone ? null : (fresh ?? chosen)
}

/** Salons near a saved place, and the way to pick another (or the current location). */
function PlaceBar({ chosen }: { chosen: ChosenPlace }) {
  const t = useT()
  // The place's name is bold inside the sentence: the sentence is one text, split where the name goes
  const [nearBefore, nearAfter = ''] = t('home.nearPlace').split('{place}')
  return (
    <Link
      to="/places"
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2"
      aria-label={t('home.placeBarLabel', { place: chosen.label, area: chosen.short })}
    >
      <span className="min-w-0 text-sm">
        <span aria-hidden>⌂ </span>{nearBefore}<span className="font-semibold">{chosen.label}</span>{nearAfter}
        <span className="block truncate text-muted">{chosen.short}</span>
      </span>
      <ChangePill />
    </Link>
  )
}

function LocationBar() {
  const t = useT()
  const { place, finding, error, locate } = useLocationStore()
  const [now] = useState(() => Date.now())
  // Where that is, in words (only for a point close enough to mean something: a laptop's guess isn't)
  const near = useAddressNear(place?.lat ?? 0, place?.lng ?? 0, place !== null && place.accuracy <= ROUGH_METRES)
  if (!place) return null
  const minutes = Math.round((now - place.at) / 60_000)
  return (
    <div className="flex flex-col gap-2">
    {error && (
      <Banner tone="warn">
        {error === 'denied'
          ? t(isApp() ? 'home.locationBlockedApp' : 'home.locationBlocked')
          : t('home.locationNotUpdated')}
      </Banner>
    )}
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-1.5">
      {/* The words get the width (Telugu runs long on a 360 px phone): Find me again sits under them, Change on the right */}
      <span className="min-w-0 flex-1 text-sm">
        <span aria-hidden>⌖ </span>{t('home.nearCurrentLocation')}
        {near.data && (
          <span className="block truncate text-muted" title={near.data}>
            {near.data}
          </span>
        )}
        <span className="block text-muted">
          {/* Accurate GPS (most phones outdoors) needs no number */}
          {place.accuracy > PRECISE_METRES &&
            `${place.accuracy < 1000
              ? t('home.accuracyMetres', { metres: String(place.accuracy) })
              : t('home.accuracyKm', { km: Math.round(place.accuracy / 1000) })} · `}
          {minutes >= 30 &&
            `${minutes < 120 ? t('home.agoMinutes', { minutes }) : t('home.agoHours', { hours: Math.round(minutes / 60) })} · `}
          <button type="button" onClick={locate} disabled={finding} className="font-semibold text-link disabled:opacity-50">
            {finding ? t('home.updating') : t('home.update')}
          </button>
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        <Link to="/places" aria-label={t('home.changePlaceLabel')}>
          <ChangePill />
        </Link>
      </span>
    </div>
    </div>
  )
}
