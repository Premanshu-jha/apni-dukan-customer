import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { chosenOf, useAddressNear, usePlaces } from '../../api/places'
import { useLocation as useLocationStore, ROUGH_METRES, type ChosenPlace } from '../../store/location'
import { Banner, Page } from '../../components/ui'
import { useSession } from '../../store/session'
import { LocationGate } from '../location/LocationGate'
import { Bell } from '../notifications/Bell'
import { SalonList } from '../salon/SalonList'

const categories = [
  { id: 'salon', label: 'Salon', icon: '✂', live: true },
  { id: 'kirana', label: 'Kirana', icon: '🛒', live: false },
  { id: 'services', label: 'Services', icon: '🔧', live: false },
] as const

type CategoryId = (typeof categories)[number]['id']

/** Home: category tabs, like Swiggy's Food and Instamart. Only Salon is open for now. */
export function Home() {
  const name = useSession((s) => s.user?.name)
  const [tab, setTab] = useState<CategoryId>('salon')
  const active = categories.find((c) => c.id === tab)!
  const chosen = useChosenPlace()

  return (
    <Page>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Hi {name?.split(' ')[0]},</p>
          <p className="text-2xl font-bold">What do you need today?</p>
        </div>
        <Bell />
      </div>
      <div role="tablist" aria-label="Categories" className="grid grid-cols-3 gap-2">
        {categories.map((c) => (
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
            {!c.live && (
              <span className="absolute top-1.5 right-1.5 rounded-full bg-raised px-1.5 text-[10px] text-muted">Soon</span>
            )}
          </button>
        ))}
      </div>
      {active.live && chosen ? (
        <>
          <PlaceBar chosen={chosen} />
          <SalonList lat={chosen.lat} lng={chosen.lng} />
        </>
      ) : active.live ? (
        <LocationGate>
          {(place) => (
            <>
              <LocationBar />
              {place.accuracy > ROUGH_METRES && (
                <Banner tone="warn">
                  Your location is only accurate to about {Math.round(place.accuracy / 1000)} km, so these salons may
                  not be the nearest. Open Clozest on your phone for better results.
                </Banner>
              )}
              <SalonList lat={place.lat} lng={place.lng} />
            </>
          )}
        </LocationGate>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line py-12 text-center">
          <p className="text-lg font-semibold">{active.label} is coming soon</p>
          <p className="max-w-xs text-muted">We're starting with salons. {active.label} near you will be here next.</p>
        </div>
      )}
    </Page>
  )
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
  return (
    <Link
      to="/places"
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2"
      aria-label={`Salons near ${chosen.label}, ${chosen.short}. Change`}
    >
      <span className="min-w-0 text-sm">
        <span aria-hidden>⌂ </span>Near <span className="font-semibold">{chosen.label}</span>
        <span className="block truncate text-muted">{chosen.short}</span>
      </span>
      <span className="text-sm font-semibold text-link">Change</span>
    </Link>
  )
}

function LocationBar() {
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
          ? 'Location is now blocked, so this is where you were last time. Allow it in your browser to update.'
          : "Couldn't update your location. Showing where you were last time."}
      </Banner>
    )}
    <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2">
      <span className="min-w-0 text-sm">
        <span aria-hidden>⌖ </span>Near your current location
        <span className="text-muted">
          {' '}
          · ±{place.accuracy < 1000 ? `${place.accuracy} m` : `${Math.round(place.accuracy / 1000)} km`}
          {minutes >= 30 && ` · ${minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`} ago`}
        </span>
        {near.data && (
          <span className="block truncate text-muted" title={near.data}>
            {near.data}
          </span>
        )}
      </span>
      <span className="flex items-center gap-4">
        <button type="button" onClick={locate} disabled={finding} className="text-sm font-semibold text-link disabled:opacity-50">
          {finding ? 'Updating…' : 'Update'}
        </button>
        <Link to="/places" className="text-sm font-semibold text-link" aria-label="Change where to find salons">
          Change
        </Link>
      </span>
    </div>
    </div>
  )
}
