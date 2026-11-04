import { useState } from 'react'
import { useLocation as useLocationStore, ROUGH_METRES } from '../../store/location'
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
      {active.live ? (
        <LocationGate>
          {(place) => (
            <>
              <LocationBar />
              {place.accuracy > ROUGH_METRES && (
                <Banner tone="warn">
                  Your location is only accurate to about {Math.round(place.accuracy / 1000)} km, so these salons may
                  not be the nearest. Open Apni Dukan on your phone for better results.
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

function LocationBar() {
  const { place, finding, error, locate } = useLocationStore()
  const [now] = useState(() => Date.now())
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
      <span className="text-sm">
        <span aria-hidden>⌖ </span>Near your current location
        <span className="text-muted">
          {' '}
          · ±{place.accuracy < 1000 ? `${place.accuracy} m` : `${Math.round(place.accuracy / 1000)} km`}
          {minutes >= 30 && ` · ${minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`} ago`}
        </span>
      </span>
      <button type="button" onClick={locate} disabled={finding} className="text-sm font-semibold text-brand disabled:opacity-50">
        {finding ? 'Updating…' : 'Update'}
      </button>
    </div>
    </div>
  )
}
