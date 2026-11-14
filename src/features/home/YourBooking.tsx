import { Link } from 'react-router'
import { MAX_UPCOMING, useLastVisit, useUpcomingBookings } from '../../api/bookings'
import { useSalon } from '../../api/salons'
import type { Booking } from '../../api/types'
import { dateOfIst, dayLabel, timeIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { StatusPill } from '../bookings/StatusPill'
import { bookAgainLink } from './bookAgain'

/** Bookings still to come or under way: the ones "Your booking" is about. */
function isAhead(b: Booking): boolean {
  return b.status === 'CONFIRMED' || b.status === 'IN_SERVICE'
}

/** Home asks for the bookings at most this often (on opening Home and on coming back to the app). */
const HOME_STALE_MS = 30_000

/**
 * On Home, for someone who has booked before: their next booking (or the one under way) with its details, then
 * "Want to book again?" with Book now, which opens the same salon with the same services ticked. With nothing coming
 * up, Book now repeats the latest past booking (completed, cancelled or missed), if that salon still takes bookings.
 * Nothing shows for a first-time customer, while loading, or if the bookings can't be read (Home stays as it was;
 * My bookings says what went wrong). At the limit of upcoming bookings there is no Book now: a third is refused.
 */
export function YourBooking() {
  const upcoming = useUpcomingBookings({ staleTime: HOME_STALE_MS })
  const ahead = upcoming.isSuccess ? upcoming.data.filter(isAhead).sort((x, y) => x.startsAt.localeCompare(y.startsAt)) : []
  const next = ahead[0] ?? null
  // The last visit only once the upcoming list says there is nothing ahead (never from a cache while it loads)
  const pastWanted = upcoming.isSuccess && next === null
  const lastVisit = useLastVisit({ enabled: pastWanted })
  const last = pastWanted ? (lastVisit.data ?? null) : null
  // Its salon may have closed or been taken off the app since: offered only while it can be opened
  const salon = useSalon(last?.salonId ?? '')
  const lastOk = last !== null && salon.isSuccess
  const again = next ?? (lastOk ? last : null)
  if (!again) return null
  // The limit counts bookings not started yet (AppointmentStore.activeBookings): one in the chair doesn't
  const full = ahead.filter((b) => b.status === 'CONFIRMED').length >= MAX_UPCOMING

  return (
    <section aria-labelledby="your-booking" className="flex flex-col gap-3">
      {next && (
        <>
          <h2 id="your-booking" className="font-display text-lg font-semibold">
            Your booking
          </h2>
          <Link
            to={`/bookings/${next.id}`}
            className="flex flex-col gap-1.5 rounded-2xl border border-brand/40 bg-brand/10 p-4 transition hover:bg-raised"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{next.salonName}</p>
              <StatusPill status={next.status} />
            </div>
            <p className="font-semibold text-link">
              {dayLabel(dateOfIst(next.startsAt))}, {timeIst(next.startsAt)} to {timeIst(next.endsAt)}
            </p>
            <p className="text-sm text-muted">
              {next.services.map((s) => s.name).join(', ')} · {rupees(next.totalPricePaise, next.priceIsFrom)}
            </p>
            {next.status === 'CONFIRMED' && next.startCode && (
              <p className="text-sm">
                Code to show at the salon: <span className="font-bold tracking-widest">{next.startCode}</span>
              </p>
            )}
          </Link>
          {ahead.length > 1 && (
            <Link to="/bookings" className="text-sm text-link underline">
              See all {ahead.length} bookings
            </Link>
          )}
        </>
      )}
      {!full && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="min-w-0">
            <h2 id={next ? undefined : 'your-booking'} className="font-semibold">
              Want to book again?
            </h2>
            <p className="text-sm text-muted">
              {again.salonName} · {again.services.map((s) => s.name).join(', ')}
              {next && ' · another time'}
            </p>
          </div>
          <Link
            to={bookAgainLink(again)}
            className="flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-brand-ink hover:brightness-110"
          >
            Book now
          </Link>
        </div>
      )}
    </section>
  )
}
