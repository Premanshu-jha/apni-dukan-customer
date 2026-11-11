import { useCallback, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useBooking, useMoveBooking } from '../../api/bookings'
import { useSalon } from '../../api/salons'
import { isApiError, messageOf } from '../../api/errors'
import { Banner, Button, ErrorState, Loading, Page } from '../../components/ui'
import { dateOfIst, dateTimeIst, timeIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import type { SlotPrice } from '../../store/bookingDraft'
import { DateChips, SlotGrid } from '../salon/SlotGrid'

export function MoveBooking() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const booking = useBooking(id)
  // The salon's booking window (day chips); read once the booking says which salon
  const salon = useSalon(booking.data?.salonId ?? '')
  const move = useMoveBooking()
  const [date, setDate] = useState<string | null>(null)
  const [startAt, setStartAt] = useState<string | null>(null)
  // The picked time's price (a move is priced again for its new time: the salon's offer there, or none)
  const [price, setPrice] = useState<SlotPrice | null>(null)
  const [taken, setTaken] = useState(false)
  const selectedGone = useCallback(() => {
    setStartAt(null)
    setTaken(true)
  }, [])

  if (booking.isPending) {
    return (
      <Page back={`/bookings/${id}`} title="Move booking">
        <Loading />
      </Page>
    )
  }
  if (booking.isError) {
    return (
      <Page back={`/bookings/${id}`} title="Move booking">
        <ErrorState message={messageOf(booking.error)} onRetry={() => booking.refetch()} />
      </Page>
    )
  }
  const b = booking.data
  if (!b.canMove) return <Navigate to={`/bookings/${id}`} replace />
  const day = date ?? dateOfIst(b.startsAt)

  return (
    <Page
      back={`/bookings/${id}`}
      title="Move booking"
      footer={
        <Button
          className="w-full"
          disabled={!startAt}
          busy={move.isPending}
          onClick={() =>
            startAt &&
            move.mutate(
              { id, salonId: b.salonId, startAt },
              {
                onSuccess: () => navigate(`/bookings/${id}`, { replace: true }),
                onError: (e) => {
                  if (isApiError(e, 'SLOT_TAKEN')) setStartAt(null)
                },
              },
            )
          }
        >
          {startAt ? `Move to ${timeIst(startAt)}` : 'Pick a new time'}
        </Button>
      }
    >
      <p className="text-muted">
        Now: <span className="text-ink">{dateTimeIst(b.startsAt)}</span> at {b.salonName}
      </p>
      {startAt && price && price.startAt === startAt && price.pricePaise !== b.totalPricePaise && (
        <p role="status">
          At {timeIst(startAt)}: <strong>{rupees(price.pricePaise, b.priceIsFrom)}</strong>{' '}
          <span className="text-muted">(now {rupees(b.totalPricePaise, b.priceIsFrom)}).</span>{' '}
          {price.listPricePaise !== null ? <span className="text-accent">That time has the salon's offer price.</span> : "The salon's offer doesn't cover that time."}
        </p>
      )}
      {taken && !startAt && !move.isError && <Banner tone="warn">That time isn't free any more. Pick another one.</Banner>}
      {move.isError && (
        <Banner tone="bad">
          {isApiError(move.error, 'SLOT_TAKEN') ? 'Someone just booked that time. Pick another one.' : messageOf(move.error)}
        </Banner>
      )}
      <DateChips
        maxDaysAhead={salon.data?.maxDaysAhead}
        value={day}
        onChange={(d) => {
          setDate(d)
          setStartAt(null)
          setTaken(false)
        }}
      />
      <SlotGrid
        salonId={b.salonId}
        serviceIds={b.services.map((s) => s.serviceId)}
        date={day}
        selected={startAt}
        onPick={(at, _terms, p) => {
          setTaken(false)
          setStartAt(at)
          setPrice(p)
        }}
        exclude={b.startsAt}
        moving={b.id}
        onSelectedGone={selectedGone}
      />
    </Page>
  )
}
