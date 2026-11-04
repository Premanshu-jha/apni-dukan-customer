import { useEffect, useState, type ReactNode } from 'react'
import { Banner, Button, Loading } from '../../components/ui'
import { platform } from '../../lib/device'
import { permissionState, STALE_MS, useLocation, type Place } from '../../store/location'

/**
 * Salons are found from the phone's location only. Before the browser asks, we say why; if location is off
 * or blocked we show how to turn it on, step by step for the person's phone.
 */
export function LocationGate({ children }: { children: (place: Place) => ReactNode }) {
  const { place, finding, error, locate } = useLocation()
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    void permissionState().then((s) => setBlocked(s === 'denied'))
  }, [error])

  // An old saved place is checked again quietly when location is already allowed (no prompt appears)
  const [openedAt] = useState(() => Date.now())
  const stale = place !== null && openedAt - place.at > STALE_MS
  useEffect(() => {
    if (!stale) return
    void permissionState().then((s) => {
      if (s === 'granted') void locate()
    })
  }, [stale, locate])

  if (place) return <>{children(place)}</>
  if (finding) return <Loading label="Finding where you are…" />
  if (blocked || error === 'denied') return <LocationGuide onRetry={locate} />

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/15 text-4xl">
        ⌖
      </span>
      <div className="flex flex-col gap-2">
        <p className="text-xl font-semibold">Find salons near you</p>
        <p className="max-w-xs text-muted">
          Apni Dukan needs your location to show salons within 5 km. It is used only to find salons and is never
          shared.
        </p>
      </div>
      {error === 'timeout' && <Banner tone="warn">That took too long. Move near a window or turn on GPS, then try again.</Banner>}
      {error === 'unavailable' && <Banner tone="warn">Your phone couldn't find your location. Check that location is on, then try again.</Banner>}
      {error === 'unsupported' && <Banner tone="bad">This browser can't share a location. Open Apni Dukan in Chrome or Safari.</Banner>}
      <Button className="w-full max-w-xs" onClick={locate}>
        Allow location
      </Button>
    </div>
  )
}

/** Shown when the browser has blocked location for this site. */
export function LocationGuide({ onRetry }: { onRetry: () => void }) {
  const p = platform()
  const steps =
    p === 'ios'
      ? [
          'Open the Settings app on your iPhone.',
          'Tap Privacy & Security, then Location Services, and make sure it is on.',
          'Scroll down to Safari Websites (or your browser) and choose "While Using the App".',
          'Come back here and reload the page, then tap Try again.',
        ]
      : p === 'android'
        ? [
            'Tap the icon at the left of the address bar (a lock or two sliders).',
            'Tap Permissions, then Location, and choose Allow.',
            'Check that Location is on in your phone’s quick settings (swipe down from the top).',
            'Come back here and tap Try again.',
          ]
        : [
            'Click the icon at the left of the address bar.',
            'Find Location and set it to Allow.',
            'Reload the page and click Try again.',
            'For the best results, open Apni Dukan on your phone: a computer can only guess your location.',
          ]
  return (
    <div className="flex flex-col gap-5 py-6">
      <div className="flex flex-col gap-2">
        <p className="text-xl font-semibold">Location is turned off</p>
        <p className="text-muted">We can only show salons near you with your location. Here's how to turn it on:</p>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}
