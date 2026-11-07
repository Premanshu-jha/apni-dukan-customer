import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useBooking, useCancelBooking } from '../../api/bookings'
import { messageOf } from '../../api/errors'
import { Banner, Button, Card, ErrorState, Loading, Page, Sheet } from '../../components/ui'
import { dateTimeIst, minutesUntil, timeIst } from '../../lib/ist'
import { duration, rupees } from '../../lib/money'
import { NotificationsPrompt } from '../profile/Notifications'
import { StatusPill } from './StatusPill'
import { cancelIsLate, lateCancelFromOf } from './lateCancel'

/** Bookings can't be moved within this many minutes of the start (the backend's TOO_LATE_TO_MOVE). */
const NO_MOVE_MIN = 60

export function BookingDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const justBooked = params.get('new') === '1'
  const booking = useBooking(id)
  const cancel = useCancelBooking()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (booking.isPending) {
    return (
      <Page back="/bookings" title="Booking">
        <Loading />
      </Page>
    )
  }
  if (booking.isError) {
    return (
      <Page back="/bookings" title="Booking">
        <ErrorState message={messageOf(booking.error)} onRetry={() => booking.refetch()} />
      </Page>
    )
  }

  const b = booking.data
  const minutes = b.services.reduce((t, s) => t + s.durationMinutes, 0)
  const withinHour = minutesUntil(b.startsAt) < NO_MOVE_MIN
  // From the booking's own lateCancelFrom: a booking made for soon is free to cancel for its first 10 minutes
  const late = cancelIsLate(b)

  return (
    <Page back="/bookings" title={`Booking ${b.bookingNo}`}>
      {justBooked && b.status === 'CONFIRMED' && <Banner tone="good">You're booked! See you at {timeIst(b.startsAt)}.</Banner>}
      {note && <Banner tone="info">{note}</Banner>}

      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{b.salonName}</p>
            <p className="text-sm text-muted">{b.salonAddress}</p>
          </div>
          <StatusPill status={b.status} />
        </div>
        <p className="text-xl font-bold text-link">{dateTimeIst(b.startsAt)}</p>
        {b.mapLink && (
          <a href={b.mapLink} target="_blank" rel="noreferrer" className="text-sm text-link underline">
            Directions
          </a>
        )}
      </Card>

      {b.status === 'CONFIRMED' && b.startCode && (
        <Card className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-muted">Show this code at the salon when you arrive</p>
          <p aria-label={`Start code ${b.startCode.split('').join(' ')}`} className="font-mono text-5xl font-bold tracking-[0.3em]">
            {b.startCode}
          </p>
          <p className="text-sm text-muted">Arrive by {timeIst(b.heldUntil)} or the booking may be marked missed.</p>
        </Card>
      )}

      {b.cancelReason && (b.status === 'CANCELLED_BY_SALON' || b.status === 'CANCELLED_BY_CUSTOMER') && (
        <Banner tone={b.status === 'CANCELLED_BY_SALON' ? 'bad' : 'info'}>Reason: {b.cancelReason}</Banner>
      )}

      <Card className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1">
          {b.services.map((s) => (
            <li key={s.serviceId} className="flex justify-between gap-3">
              <span>
                {s.name} <span className="text-sm text-muted">· {duration(s.durationMinutes)}</span>
              </span>
              <span>{rupees(s.pricePaise, s.priceIsFrom)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line pt-2 font-semibold">
          <span>Total · about {duration(minutes)}</span>
          <span>{rupees(b.totalPricePaise, b.priceIsFrom)}</span>
        </div>
        <p className="text-sm text-muted">Pay at the salon.</p>
      </Card>

      {justBooked && <NotificationsPrompt />}

      {(b.canMove || b.canChange) && (
        <div className="flex flex-col gap-2">
          {b.canMove ? (
            <Button variant="secondary" onClick={() => navigate(`/bookings/${b.id}/move`)}>
              Move to another time
            </Button>
          ) : (
            b.canChange && (
              <p className="text-center text-sm text-muted">
                {withinHour
                  ? "Bookings can't be moved within 1 hour of the start."
                  : "The salon isn't taking changes right now, so this booking can't be moved. You can still cancel it."}
              </p>
            )
          )}
          {b.canChange && (
            <p className="text-center text-sm text-muted">
              {late
                ? 'Cancelling now counts as a late cancel.'
                : `Free to cancel until ${dateTimeIst(lateCancelFromOf(b))}.`}
            </p>
          )}
          {b.canChange && (
            <Button variant="danger" onClick={() => setAsking(true)}>
              Cancel booking
            </Button>
          )}
        </div>
      )}

      <p className="text-center text-sm text-muted">
        <Link to={`/salons/${b.salonId}`} className="underline">
          Book again at {b.salonName}
        </Link>
      </p>

      <Sheet open={asking} title="Cancel this booking?" onClose={() => setAsking(false)}>
        <div className="flex flex-col gap-4">
          {late ? (
            <Banner tone="warn">
              It's past {timeIst(lateCancelFromOf(b))}, so this counts as a late cancel. Too many late cancels or missed bookings
              can stop you booking for a while.
            </Banner>
          ) : (
            <p className="text-muted">The salon will be told, and the time goes back on offer.</p>
          )}
          {cancel.isError && <Banner tone="bad">{messageOf(cancel.error)}</Banner>}
          <Button
            variant="danger"
            busy={cancel.isPending}
            onClick={() =>
              cancel.mutate(b.id, {
                onSuccess: (r) => {
                  setAsking(false)
                  setNote(r.countedAsLate ? 'Cancelled. This was counted as a late cancel.' : 'Cancelled.')
                },
              })
            }
          >
            Yes, cancel it
          </Button>
          <Button variant="secondary" onClick={() => setAsking(false)}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}
