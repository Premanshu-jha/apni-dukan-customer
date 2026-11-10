import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { isApiError, messageOf } from '../../api/errors'
import { SALONS_RADIUS_KM, useNearbySalons } from '../../api/salons'
import { Button, EmptyState, ErrorState, Loading } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'
import { openText, ratingText, servicesText } from '../../lib/salonCard'


/** A moment as India time "HH:mm", for "Opens at …" on the cards. */
function hhmmIst(at: number): string {
  return new Date(at + 5.5 * 3600_000).toISOString().slice(11, 16)
}

export function SalonList({ lat, lng }: { lat: number; lng: number }) {
  const salons = useNearbySalons(lat, lng)
  const [offlineTap, setOfflineTap] = useState(false)
  const listRef = useRef<HTMLUListElement | null>(null)
  // Index of the first salon the next page brings (set when "Show more salons" is tapped)
  const focusIndex = useRef<number | null>(null)
  const loaded = salons.data?.pages.flat().length ?? 0

  // After "Show more salons", move focus to the first salon that just appeared (keyboard and screen readers)
  useEffect(() => {
    if (focusIndex.current !== null && loaded > focusIndex.current) {
      listRef.current?.querySelector<HTMLAnchorElement>(`a[data-index="${focusIndex.current}"]`)?.focus()
      focusIndex.current = null
    }
  }, [loaded])
  // The time the list was read, like its openNow: a list read again in the evening doesn't say "Opens at 10:00 AM"
  const now = hhmmIst(salons.dataUpdatedAt)

  if (salons.isPending) return <Loading label="Looking for salons near you…" />
  // Only when nothing is on screen yet: a failed "Show more" (or a background refresh) keeps the list and says so
  if (salons.isError && !salons.data) {
    // The backend answers VALIDATION_FAILED on lat/lng for a point outside India
    if (isApiError(salons.error, 'VALIDATION_FAILED')) {
      return (
        <EmptyState
          title="Clozest works only in India"
          body="Your location seems to be outside India. Open the app when you're in India, or tap Update after moving."
        />
      )
    }
    return <ErrorState message={messageOf(salons.error)} onRetry={() => salons.refetch()} />
  }
  const list = salons.data.pages.flat()
  const moreFailed = salons.isFetchNextPageError
  const refreshFailed = salons.isRefetchError && !salons.isFetchNextPageError
  if (list.length === 0) {
    return (
      <EmptyState
        title="No salons near you yet"
        body="We're adding salons area by area. Tell us where you are and we'll come to you sooner."
        action={
          <a
            className="text-link underline"
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Please add salons near me')}&body=${encodeURIComponent(`My area: \nLocation: ${lat.toFixed(4)}, ${lng.toFixed(4)}`)}`}
          >
            Let us know
          </a>
        }
      />
    )
  }

  return (
    <section aria-label="Salons near you" className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {salons.hasNextPage ? 'Salons' : `${list.length} ${list.length === 1 ? 'salon' : 'salons'}`} within{' '}
        {SALONS_RADIUS_KM} km, nearest first
      </p>
      <p aria-live="polite" className="sr-only">
        {list.length} salons shown
      </p>
      <ul ref={listRef} className="flex flex-col gap-3">
        {list.map((s, i) => (
          <li key={s.id}>
            <Link
              data-index={i}
              to={`/salons/${s.id}`}
              className="flex gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:bg-raised"
            >
              <SalonPhoto url={s.photoUrl} name={s.name} />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{s.name}</p>
                  <span className={`shrink-0 text-sm ${s.rating && s.rating.average !== null ? 'font-semibold text-warn' : 'text-muted'}`}>
                    {s.rating ? ratingText(s.rating) : ''}
                  </span>
                </div>
                <p className="truncate text-sm text-muted">
                  {s.addressLine ? `${s.addressLine}, ` : ''}
                  {s.area}
                </p>
                {s.topServices?.length > 0 && (
                  <p className="line-clamp-2 text-sm">{servicesText(s.topServices, s.serviceCount)}</p>
                )}
                <p className="text-sm">
                  <span
                    className={`mr-2 inline-block rounded-full border px-2 text-xs font-medium ${
                      s.registered ? 'border-good text-good' : 'border-line text-muted'
                    }`}
                  >
                    {s.registered ? 'Registered' : 'Unregistered'}
                  </span>
                  <span className="text-link">{s.distanceKm.toFixed(1)} km away</span>
                  {openText(s, now) && (
                    <span className={s.openNow ? ' text-good' : ' text-muted'}> · {openText(s, now)}</span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {(moreFailed || offlineTap || refreshFailed) && (
        <p role="alert" className="text-sm text-bad">
          {offlineTap
            ? "You're offline. Connect to the internet and tap Show more salons again."
            : moreFailed
              ? "Couldn't load more salons. Check your connection and tap Show more salons again."
              : "Couldn't refresh the list. It may be a little out of date."}
        </p>
      )}
      {salons.hasNextPage && (
        // aria-busy, not disabled: a disabled button would drop the keyboard focus while it loads
        <Button
          variant="secondary"
          aria-busy={salons.isFetchingNextPage}
          onClick={() => {
            if (salons.isFetchingNextPage) return
            if (!navigator.onLine) {
              setOfflineTap(true)
              return
            }
            setOfflineTap(false)
            focusIndex.current = list.length
            void salons.fetchNextPage()
          }}
        >
          {salons.isFetchingNextPage ? 'Loading more salons…' : 'Show more salons'}
        </Button>
      )}
    </section>
  )
}

export function SalonPhoto({ url, name, large = false }: { url: string | null; name: string; large?: boolean }) {
  const size = large ? 'h-48 w-full rounded-2xl' : 'h-20 w-20 rounded-xl'
  if (!url) {
    return (
      <div aria-hidden className={`${size} flex shrink-0 items-center justify-center bg-raised text-3xl text-muted`}>
        ✂
      </div>
    )
  }
  return <img src={url} alt={large ? `${name}` : ''} loading="lazy" className={`${size} shrink-0 object-cover`} />
}
