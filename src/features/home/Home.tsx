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
import { HomeVisitTip, HowItWorks, PlacesHint } from '../guide/HomeGuide'
import { HelpButton } from '../help/HelpButton'
import { useT } from '../../i18n'

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
          <h1 className="font-display text-2xl font-bold">{first ? t('home.greetingWithName', { greeting: hello, name: first }) : hello}</h1>
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
              <PlacesHint />
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
      <span className="text-sm font-semibold text-link">{t('common.change')}</span>
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
          ? t('home.locationBlocked')
          : t('home.locationNotUpdated')}
      </Banner>
    )}
    <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2">
      <span className="min-w-0 text-sm">
        <span aria-hidden>⌖ </span>{t('home.nearCurrentLocation')}
        <span className="text-muted">
          {' '}
          · {place.accuracy < 1000
            ? t('home.accuracyMetres', { metres: String(place.accuracy) })
            : t('home.accuracyKm', { km: Math.round(place.accuracy / 1000) })}
          {minutes >= 30 &&
            ` · ${minutes < 120 ? t('home.agoMinutes', { minutes }) : t('home.agoHours', { hours: Math.round(minutes / 60) })}`}
        </span>
        {near.data && (
          <span className="block truncate text-muted" title={near.data}>
            {near.data}
          </span>
        )}
      </span>
      <span className="flex items-center gap-4">
        <button type="button" onClick={locate} disabled={finding} className="text-sm font-semibold text-link disabled:opacity-50">
          {finding ? t('home.updating') : t('home.update')}
        </button>
        <Link to="/places" className="text-sm font-semibold text-link" aria-label={t('home.changePlaceLabel')}>
          {t('common.change')}
        </Link>
      </span>
    </div>
    </div>
  )
}
