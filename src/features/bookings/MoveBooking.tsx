import { useCallback, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useBooking, useMoveBooking } from '../../api/bookings'
import { useSalon } from '../../api/salons'
import { isApiError, messageOf } from '../../api/errors'
import { Banner, Button, ErrorState, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { dateOfIst, dateTimeIst, timeIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import type { SlotPrice } from '../../store/bookingDraft'
import { DateChips, SlotGrid } from '../salon/SlotGrid'

export function MoveBooking() {
  const t = useT()
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
      <Page back={`/bookings/${id}`} title={t('bookings.moveTitle')}>
        <Loading />
      </Page>
    )
  }
  if (booking.isError) {
    return (
      <Page back={`/bookings/${id}`} title={t('bookings.moveTitle')}>
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
      title={t('bookings.moveTitle')}
      help={{ about: t('bookings.helpAbout', { no: b.bookingNo }) }}
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
                // The booking page says it worked ("Moved to Tue 2 Dec, 5:30 PM"), at the top, in focus
                onSuccess: (moved) => navigate(`/bookings/${id}`, { replace: true, state: { movedTo: moved.startsAt } }),
                onError: (e) => {
                  if (isApiError(e, 'SLOT_TAKEN')) setStartAt(null)
                },
              },
            )
          }
        >
          {startAt ? t('bookings.moveTo', { time: timeIst(startAt) }) : t('bookings.pickNewTime')}
        </Button>
      }
    >
      <p className="text-muted">
        {t('bookings.nowBefore')}
        <span className="text-ink">{dateTimeIst(b.startsAt)}</span>
        {t('bookings.nowAfter', { salon: b.salonName })}
      </p>
      {startAt && price && price.startAt === startAt && price.pricePaise !== b.totalPricePaise && (
        <p role="status">
          {t('bookings.priceAt', { time: timeIst(startAt) })}
          <strong>{rupees(price.pricePaise, b.priceIsFrom)}</strong>{' '}
          <span className="text-muted">{t('bookings.priceNow', { price: rupees(b.totalPricePaise, b.priceIsFrom) })}</span>{' '}
          {price.listPricePaise !== null ? (
            <span className="text-accent">{t('bookings.offerCovers')}</span>
          ) : (
            t('bookings.offerNotCovers')
          )}
        </p>
      )}
      {taken && !startAt && !move.isError && <Banner tone="warn">{t('bookings.timeNotFree')}</Banner>}
      {move.isError && (
        <Banner tone="bad">
          {isApiError(move.error, 'SLOT_TAKEN') ? t('bookings.slotTaken') : messageOf(move.error)}
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
        // A move keeps the booking's own length, whatever the salon's services take now
        minutes={Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000)}
        onSelectedGone={selectedGone}
        maxDaysAhead={salon.data?.maxDaysAhead}
        closedDates={salon.data?.closedDates}
        onDate={(d) => {
          setDate(d)
          setStartAt(null)
          setTaken(false)
        }}
      />
    </Page>
  )
}
