import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { isApiError, messageOf } from '../../api/errors'
import { SALONS_RADIUS_KM, useNearbySalons } from '../../api/salons'
import { Button, EmptyState, ErrorState, Loading } from '../../components/ui'
import { offerBadgeText, openText, ratingText, servicesText } from '../../lib/salonCard'
import { todayIst } from '../../lib/ist'
import { useT } from '../../i18n'


/** A moment as India time "HH:mm", for "Opens at …" on the cards. */
function hhmmIst(at: number): string {
  return new Date(at + 5.5 * 3600_000).toISOString().slice(11, 16)
}

export function SalonList({ lat, lng }: { lat: number; lng: number }) {
  const t = useT()
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
  // Each page's cards are told from when that page was read, like their openNow (a page read later doesn't move them)
  const fallbackNow = salons.dataUpdatedAt

  if (salons.isPending) return <Loading label={t('salon.lookingForSalons')} />
  // Only when nothing is on screen yet: a failed "Show more" (or a background refresh) keeps the list and says so
  if (salons.isError && !salons.data) {
    // The backend answers VALIDATION_FAILED on lat/lng for a point outside India
    if (isApiError(salons.error, 'VALIDATION_FAILED')) {
      return (
        <EmptyState
          title={t('salon.outsideIndiaTitle')}
          body={t('salon.outsideIndiaBody')}
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
        title={t('salon.noSalonsTitle')}
        body={t('salon.noSalonsBody')}
        action={
          <Link
            className="text-link underline"
            to={`/help?${new URLSearchParams({ about: t('salon.addSalonsHelpAbout'), text: t('salon.addSalonsHelpText', { lat: lat.toFixed(4), lng: lng.toFixed(4) }) })}`}
          >
            {t('salon.letUsKnow')}
          </Link>
        }
      />
    )
  }

  return (
    <section aria-label={t('salon.salonsNearYou')} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {salons.hasNextPage
          ? t('salon.listHeadingMore', { km: SALONS_RADIUS_KM })
          : t('salon.listHeadingCount', { count: list.length, km: SALONS_RADIUS_KM })}
      </p>
      <p aria-live="polite" className="sr-only">
        {t('salon.salonsShown', { count: list.length })}
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
                  <span className={`shrink-0 text-sm ${s.rating && s.rating.average !== null ? 'font-semibold text-accent' : 'text-muted'}`}>
                    {s.rating ? ratingText(s.rating) : ''}
                  </span>
                </div>
                <p className="truncate text-sm text-muted">
                  {s.addressLine ? `${s.addressLine}, ` : ''}
                  {s.area}
                </p>
                {s.offer && (
                  <p>
                    <span className="inline-block rounded-full bg-accent/15 px-2 text-xs font-semibold text-accent">
                      {offerBadgeText(s.offer, todayIst(new Date(s.readAt ?? fallbackNow)))}
                    </span>
                  </p>
                )}
                {s.topServices?.length > 0 && (
                  <p className="line-clamp-2 text-sm">{servicesText(s.topServices, s.serviceCount)}</p>
                )}
                <p className="text-sm">
                  {/* Only a salon whose trade licence passed our check (and is still valid): no badge otherwise */}
                  {s.registered && (
                    <span
                      className="mr-2 inline-block rounded-full border border-good px-2 text-xs font-medium text-good"
                      title={t('salon.licenceCheckedTitle')}
                    >
                      {t('salon.licensed')}
                    </span>
                  )}
                  <span className="text-link">{t('salon.kmAway', { km: s.distanceKm.toFixed(1) })}</span>
                  {openText(s, hhmmIst(s.readAt ?? fallbackNow)) && (
                    <span className={s.openNow ? ' text-good' : ' text-muted'}> · {openText(s, hhmmIst(s.readAt ?? fallbackNow))}</span>
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
            ? t('salon.offlineShowMore')
            : moreFailed
              ? t('salon.moreFailed')
              : t('salon.refreshListFailed')}
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
          {salons.isFetchingNextPage ? t('salon.loadingMore') : t('salon.showMore')}
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
