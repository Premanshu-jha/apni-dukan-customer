import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { SALONS_RADIUS_KM } from '../../api/salons'
import { Banner, Button, Loading } from '../../components/ui'
import { platform } from '../../lib/device'
import { permissionState, STALE_MS, useLocation, type Place } from '../../store/location'
import { useT } from '../../i18n'

/**
 * Salons near the phone's location. Before the browser asks, we say why; if location is off or blocked we show how to
 * turn it on, step by step for the person's phone. Either way the customer can instead pick a saved place or enter an
 * address (/places).
 */
export function LocationGate({ children }: { children: (place: Place) => ReactNode }) {
  const t = useT()
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
  if (finding) return <Loading label={t('places.findingYou')} />
  if (blocked || error === 'denied') {
    return (
      <>
        <LocationGuide onRetry={locate} />
        <OrAnAddress />
      </>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/15 text-4xl">
        ⌖
      </span>
      <div className="flex flex-col gap-2">
        <p className="text-xl font-semibold">{t('places.findSalonsNearYou')}</p>
        <p className="max-w-xs text-muted">
          {/* The same radius as the list and the backend (BookingService.RADIUS_METRES) */}
          {t('places.locationWhy', { km: SALONS_RADIUS_KM })}
        </p>
      </div>
      {error === 'timeout' && <Banner tone="warn">{t('places.gateTimeout')}</Banner>}
      {error === 'unavailable' && <Banner tone="warn">{t('places.gateUnavailable')}</Banner>}
      {error === 'unsupported' && <Banner tone="bad">{t('places.gateUnsupported')}</Banner>}
      <Button className="w-full max-w-xs" onClick={locate}>
        {t('places.allowLocation')}
      </Button>
      <OrAnAddress />
    </div>
  )
}

/** The way round location: a saved place, or an address typed in. */
function OrAnAddress() {
  const t = useT()
  return (
    <Link to="/places" className="py-2 text-center text-link underline">
      {t('places.orEnterAddress')}
    </Link>
  )
}

/** Shown when the browser has blocked location for this site. */
export function LocationGuide({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  const p = platform()
  const steps =
    p === 'ios'
      ? [
          t('places.guideIos1'),
          t('places.guideIos2'),
          t('places.guideIos3'),
          t('places.guideIos4'),
        ]
      : p === 'android'
        ? [
            t('places.guideAndroid1'),
            t('places.guideAndroid2'),
            t('places.guideAndroid3'),
            t('places.guideAndroid4'),
          ]
        : [
            t('places.guideDesktop1'),
            t('places.guideDesktop2'),
            t('places.guideDesktop3'),
            t('places.guideDesktop4'),
          ]
  return (
    <div className="flex flex-col gap-5 py-6">
      <div className="flex flex-col gap-2">
        <p className="text-xl font-semibold">{t('places.locationOff')}</p>
        <p className="text-muted">{t('places.locationOffHow')}</p>
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
      <Button onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  )
}
