import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { PAST_MAX_PAGES, PAST_PAGE, useMorePastAfterCap, usePastBookings, useUpcomingBookings } from '../../api/bookings'
import { isApiError, messageOf } from '../../api/errors'
import { uniqueById } from '../../api/pages'
import type { Booking } from '../../api/types'
import { Button, Chip, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { canRate } from '../../lib/ratings'
import { StatusPill } from './StatusPill'

export function MyBookings() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')

  return (
    <Page title="My bookings">
      <div role="group" aria-label="Which bookings" className="flex gap-2">
        <Chip selected={when === 'upcoming'} onClick={() => setWhen('upcoming')}>
          Upcoming
        </Chip>
        <Chip selected={when === 'past'} onClick={() => setWhen('past')}>
          Past
        </Chip>
      </div>
      {when === 'upcoming' ? <Upcoming /> : <Past />}
    </Page>
  )
}

function Upcoming() {
  const list = useUpcomingBookings()
  if (list.isPending) return <Loading />
  if (list.isError) return <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
  if (list.data.length === 0) {
    return (
      <EmptyState
        title="No upcoming bookings"
        body="Find a salon near you and book a time."
        action={
          <Link to="/" className="text-link underline">
            Find a salon
          </Link>
        }
      />
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {list.data.map((b, i) => (
        <li key={b.id}>
          <BookingCard b={b} index={i} />
        </li>
      ))}
    </ul>
  )
}

/** Past bookings, latest first, 30 at a time with "Show more bookings" (as the salon list). */
function Past() {
  const list = usePastBookings()
  const listRef = useRef<HTMLUListElement | null>(null)
  const countRef = useRef<HTMLParagraphElement | null>(null)
  // Index of the first booking the next page brings (set when "Show more bookings" is tapped)
  const focusIndex = useRef<number | null>(null)
  const items = uniqueById(list.data?.pages ?? [])
  const loaded = items.length
  // "You're offline" from a tap: only while the list is as it was then (gone once a page loads)
  const [offlineAt, setOfflineAt] = useState<number | null>(null)
  const offlineTap = offlineAt !== null && offlineAt === loaded
  // At the cap with a full last page: ask whether anything really comes after (exactly 300: nothing)
  const pages = list.data?.pages ?? []
  const last = pages[pages.length - 1]
  const full = pages.length >= PAST_MAX_PAGES && last !== undefined && last.length >= PAST_PAGE
  const afterCap = useMorePastAfterCap(full ? { afterStart: last[last.length - 1].startsAt, afterId: last[last.length - 1].id } : null)

  // After "Show more bookings", focus the first booking that appeared; when the page brought nothing (exactly 30
  // were left) the button is gone, so focus goes to the count; after a failed page it stays on the button.
  const fetchingMore = list.isFetchingNextPage
  useEffect(() => {
    if (focusIndex.current === null || fetchingMore) return
    if (loaded > focusIndex.current) {
      listRef.current?.querySelector<HTMLAnchorElement>(`a[data-index="${focusIndex.current}"]`)?.focus()
    } else if (!document.activeElement || document.activeElement === document.body) {
      countRef.current?.focus()
    }
    focusIndex.current = null
  }, [loaded, fetchingMore])

  if (list.isPending) return <Loading />
  // Only when nothing is on screen yet: a failed "Show more" (or refresh) keeps the list and says so
  if (list.isError && !list.data) return <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
  if (loaded === 0) return <EmptyState title="No past bookings" />
  const capped = full && afterCap.data === true
  const moreFailed = list.isFetchNextPageError
  const refreshFailed = list.isRefetchError

  return (
    <section aria-label="Past bookings" className="flex flex-col gap-3">
      <p ref={countRef} tabIndex={-1} className="text-sm text-muted focus:outline-none">
        {list.hasNextPage || capped
          ? `Your latest ${loaded} bookings`
          : `${loaded} past ${loaded === 1 ? 'booking' : 'bookings'}`}
        , latest first
      </p>
      <p aria-live="polite" className="sr-only">
        {loaded} bookings shown
      </p>
      <ul ref={listRef} aria-busy={list.isFetchingNextPage} className="flex flex-col gap-3">
        {items.map((b, i) => (
          // Drawn only near the screen (the browser skips cards far off it but keeps them in the page)
          <li key={b.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_112px]">
            <BookingCard b={b} index={i} />
          </li>
        ))}
      </ul>
      {capped && <p className="text-center text-sm text-muted">Showing your latest {loaded} bookings.</p>}
      {(moreFailed || offlineTap || refreshFailed) && (
        <p role="alert" className="text-sm text-bad">
          {offlineTap
            ? "You're offline. Connect to the internet and tap Show more bookings again."
            : moreFailed
              ? isApiError(list.error, 'NETWORK')
                ? "You're offline or the server can't be reached. Connect and tap Show more bookings again."
                : "Couldn't load more bookings. Tap Show more bookings to try again."
              : "Couldn't refresh the list. It may be a little out of date."}
        </p>
      )}
      {list.hasNextPage && (
        // aria-busy, not disabled: a disabled button would drop the keyboard focus while it loads
        <Button
          variant="secondary"
          aria-busy={list.isFetchingNextPage}
          onClick={() => {
            if (list.isFetchingNextPage) return
            if (!navigator.onLine) {
              setOfflineAt(loaded)
              return
            }
            setOfflineAt(null)
            focusIndex.current = loaded
            void list.fetchNextPage()
          }}
        >
          {list.isFetchingNextPage ? 'Loading more bookings…' : 'Show more bookings'}
        </Button>
      )}
    </section>
  )
}

function BookingCard({ b, index }: { b: Booking; index: number }) {
  const [now] = useState(Date.now)
  return (
    <Link
      to={`/bookings/${b.id}`}
      data-index={index}
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 transition hover:bg-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{b.salonName}</p>
        <StatusPill status={b.status} />
      </div>
      <p className="text-link">{dateTimeIst(b.startsAt)}</p>
      <p className="truncate text-sm text-muted">
        {b.services.map((s) => s.name).join(', ')} · {rupees(b.totalPricePaise, b.priceIsFrom)}
      </p>
      {!b.rating && canRate(b.rateUntil, now) && <p className="text-sm font-semibold text-accent">★ Rate your visit</p>}
    </Link>
  )
}
