import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { isApiError, messageOf } from '../../api/errors'
import { SALONS_RADIUS_KM, isSearchLimited, useNearbySalons } from '../../api/salons'
import { Button, EmptyState, ErrorState, Loading } from '../../components/ui'
import { offerBadgeText, openText, ratingText, servicesText } from '../../lib/salonCard'
import { todayIst } from '../../lib/ist'
import { SEARCH_CHIPS, SEARCH_DEBOUNCE_MS, searchQuery, tidySearch } from '../../lib/salonSearch'
import { useSalonSearch } from '../../store/salonSearch'
import { useT } from '../../i18n'
import { SalonSearchBox } from './SalonSearchBox'


/** A moment as India time "HH:mm", for "Opens at …" on the cards. */
function hhmmIst(at: number): string {
  return new Date(at + 5.5 * 3600_000).toISOString().slice(11, 16)
}

/** What the list is searching for: q as sent (searchQuery; '' for all salons) and the words as the customer typed them. */
interface Search {
  q: string
  shown: string
}

/**
 * The salons near the point, with the search box above them. The typed text is kept in useSalonSearch (so it is
 * still there coming back from a salon, or after picking another place); the list follows it after a pause in typing
 * (SEARCH_DEBOUNCE_MS), at once for the keyboard's Search key, a chip, or clearing.
 */
export function SalonList({ lat, lng }: { lat: number; lng: number }) {
  const t = useT()
  const { text: typed, chip, setText, clear } = useSalonSearch()
  const input = useRef<HTMLInputElement | null>(null)
  // A chip tapped shows its label in the language showing now (tapped in Hindi, then switched to English: "Beard")
  const chipLabel = SEARCH_CHIPS.find((c) => c.q === chip)?.label
  const tappedChip = chipLabel ? chip : null
  const text = chipLabel ? t(chipLabel) : typed
  const wantedQ = searchQuery(text, tappedChip)
  const wantedShown = tidySearch(text)
  // Coming back with words already typed: their results at once (from the cache when they were just shown)
  const [search, setSearch] = useState<Search>({ q: wantedQ, shown: wantedShown })
  useEffect(() => {
    if (wantedQ === search.q) return
    const id = window.setTimeout(() => setSearch({ q: wantedQ, shown: wantedShown }), wantedQ === '' ? 0 : SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [wantedQ, wantedShown, search.q])
  // The same search typed differently ("Facial " and "facial"): only the words in the heading follow, no new request
  const current: Search = wantedQ === search.q && wantedQ !== '' ? { q: search.q, shown: wantedShown } : search
  const clearSearch = () => {
    clear()
    setSearch({ q: '', shown: '' })
  }

  return (
    <>
      <SalonSearchBox
        text={text}
        chip={tappedChip}
        inputRef={input}
        onText={(next, tapped) => {
          setText(next, tapped ?? null)
          if (tapped) setSearch({ q: searchQuery(next, tapped), shown: tidySearch(next) })
        }}
        onSubmit={() => setSearch({ q: wantedQ, shown: wantedShown })}
        onClear={clearSearch}
      />
      {/* Keyed on the search: a new one starts afresh (no "You're offline" left from the last one's Show more) */}
      <SalonResults key={current.q} lat={lat} lng={lng} search={current} onClearSearch={clearSearch} />
    </>
  )
}

function SalonResults({ lat, lng, search, onClearSearch }: { lat: number; lng: number; search: Search; onClearSearch: () => void }) {
  const t = useT()
  const { q, shown } = search
  const salons = useNearbySalons(lat, lng, q)
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

  // A new search while offline waits for the connection (TanStack holds it): say so instead of spinning
  if (salons.isPending && q && salons.fetchStatus === 'paused') {
    return <ErrorState message={t('salon.searchOffline')} />
  }
  // Past the backend's limit on searches: it is tried once more by itself after Retry-After, the words stay typed
  if (salons.isPending && q && isSearchLimited(salons.failureReason)) {
    return <ErrorState message={t('salon.searchLimitedWaiting')} />
  }
  if (salons.isPending) return <Loading label={q ? t('salon.searching', { q: shown }) : t('salon.lookingForSalons')} />
  // Only when nothing is on screen yet: a failed "Show more" (or a background refresh) keeps the list and says so
  if (salons.isError && !salons.data) {
    // The words themselves refused (an app that let fewer than 2 or more than 60 characters through)
    if (q && isApiError(salons.error, 'VALIDATION_FAILED') && salons.error.details.q !== undefined) {
      return <EmptyState title={t('salon.searchTypeMore')} action={<ClearSearch onClear={onClearSearch} />} />
    }
    // The backend answers VALIDATION_FAILED on lat/lng for a point outside India
    if (isApiError(salons.error, 'VALIDATION_FAILED')) {
      return (
        <EmptyState
          title={t('salon.outsideIndiaTitle')}
          body={t('salon.outsideIndiaBody')}
        />
      )
    }
    if (q && isSearchLimited(salons.error)) {
      return <ErrorState message={t('salon.searchLimited')} onRetry={() => salons.refetch()} />
    }
    return <ErrorState message={messageOf(salons.error)} onRetry={() => salons.refetch()} />
  }
  const list = salons.data.pages.flat()
  const moreFailed = salons.isFetchNextPageError
  const refreshFailed = salons.isRefetchError && !salons.isFetchNextPageError
  if (list.length === 0 && q) {
    return (
      <EmptyState
        title={t('salon.searchNoneTitle', { q: shown, km: SALONS_RADIUS_KM })}
        body={t('salon.searchNoneBody')}
        action={
          <div className="flex flex-col items-center gap-3">
            <ClearSearch onClear={onClearSearch} />
            <Link
              className="text-link underline"
              to={`/help?${new URLSearchParams({ about: t('salon.searchHelpAbout', { q: shown }), text: t('salon.searchHelpText', { q: shown, lat: lat.toFixed(4), lng: lng.toFixed(4) }) })}`}
            >
              {t('salon.letUsKnow')}
            </Link>
          </div>
        }
      />
    )
  }
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
    <section aria-label={q ? t('salon.searchResultsLabel', { q: shown }) : t('salon.salonsNearYou')} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {q
          ? salons.hasNextPage
            ? t('salon.searchHeadingMore', { q: shown, km: SALONS_RADIUS_KM })
            : t('salon.searchHeadingCount', { count: list.length, q: shown, km: SALONS_RADIUS_KM })
          : salons.hasNextPage
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

/** Back to all the salons near the point (from a search that found nothing). */
function ClearSearch({ onClear }: { onClear: () => void }) {
  const t = useT()
  return (
    <Button variant="secondary" onClick={onClear}>
      {t('salon.clearSearchButton')}
    </Button>
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
