import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useBook } from '../../api/bookings'
import { isApiError, messageOf, salonReadMessage } from '../../api/errors'
import { useSalon, useSalonServices, useSlots } from '../../api/salons'
import { Banner, Button, Card, ErrorState, Loading, Page, Switch } from '../../components/ui'
import { dateTimeIst, isAtLeastMinutesAway, timeIst } from '../../lib/ist'
import { duration, rupees } from '../../lib/money'
import { useDraft } from '../../store/bookingDraft'
import { useSession } from '../../store/session'
import { authApi } from '../../api/auth'
import { rememberReturn } from '../auth/flow'
import { lateCancelSoon, termsFor } from '../bookings/lateCancel'

/** A booking can't be moved within this many minutes of its start (the backend's LATE_CANCEL). */
const LATE_CANCEL_MIN = 60

/** Answers from the backend that end this attempt: the next Book is a new booking, so it needs a new key. */
const FINAL = new Set([
  'SLOT_TAKEN',
  'OUTSIDE_WINDOW',
  'TOO_MANY_BOOKINGS',
  'BOOKING_BLOCKED',
  'SALON_NOT_BOOKABLE',
  'NO_BARBER_FOR_SERVICES',
  'VALIDATION_FAILED',
  'TOO_MANY_CHANGES',
  'OVERLAPS_YOUR_BOOKING',
])

export function ConfirmBooking() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const salon = useSalon(id)
  const services = useSalonServices(id)
  const { draft, pickSlot, newAttempt, clear, setEarlierAlert } = useDraft()
  const book = useBook()
  const qc = useQueryClient()
  const setUser = useSession((s) => s.setUser)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  // Set when leaving this screen, so changing the draft on the way out doesn't bounce it back to the salon.
  const [leaving, setLeaving] = useState(false)
  // The late-cancel warning depends on the clock: look again every 15 seconds while the screen is open
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  // The free times of the services actually sent, read again here (from the cache when fresh): the price at the
  // picked time as it is now, so an offer ended or published meanwhile, or a service gone, shows its real price
  const liveIds = (services.data ?? []).filter((s) => draft?.serviceIds.includes(s.id)).map((s) => s.id)
  const slots = useSlots(id, draft?.date && draft.startAt ? liveIds : [], draft?.date ?? '')
  // Once on opening, even if the times were read a moment ago: the price shown is the one asked for now
  const refetchSlots = slots.refetch
  const slotsOn = liveIds.length > 0 && Boolean(draft?.date)
  useEffect(() => {
    if (slotsOn) void refetchSlots()
  }, [slotsOn, refetchSlots])

  if (leaving) return null

  if (!draft || draft.salonId !== id || !draft.startAt || draft.serviceIds.length === 0) {
    return <Navigate to={`/salons/${id}`} replace />
  }
  if (salon.isPending || services.isPending) {
    return (
      <Page back={`/salons/${id}/book`} title="Confirm booking">
        <Loading />
      </Page>
    )
  }
  // Only when there is nothing to show: a failed refresh (a 429 on coming back to the app) keeps the page
  if ((salon.isError && !salon.data) || (services.isError && !services.data)) {
    return (
      <Page back={`/salons/${id}/book`} title="Confirm booking">
        <ErrorState
          message={salonReadMessage(salon.error ?? services.error)}
          onRetry={() => {
            void salon.refetch()
            void services.refetch()
          }}
        />
      </Page>
    )
  }

  const chosen = (services.data ?? []).filter((s) => draft.serviceIds.includes(s.id))
  // A service the salon removed since it was picked: what is sent must be exactly what is shown
  const sendIds = chosen.map((s) => s.id)
  const minutes = chosen.reduce((t, s) => t + s.durationMinutes, 0)
  const listPaise = chosen.reduce((t, s) => t + s.pricePaise, 0)
  // The time's price from the free times as read now (or, until they are, as picked, if for the same services): with
  // the salon's offer there, less than the services' own prices. The backend prices the booking again when it is
  // made; an offer ended in the last seconds shows on the booking's page
  const fresh = slots.data?.starts.find((s) => s.startAt === draft.startAt)
  const freshPrice = fresh && typeof fresh.pricePaise === 'number'
    ? { startAt: fresh.startAt, pricePaise: fresh.pricePaise, listPricePaise: fresh.listPricePaise ?? null }
    : null
  const picked = draft.price && draft.price.startAt === draft.startAt && liveIds.length === draft.serviceIds.length ? draft.price : null
  // Read again and the time isn't there any more (taken, or now too soon): no price is claimed for it
  const timeGone = Boolean(slots.data) && !slots.isError && !fresh
  const slotPrice = slots.data ? freshPrice : picked
  const offer = slotPrice !== null && slotPrice.listPricePaise !== null
  const paise = offer ? slotPrice.pricePaise : listPaise
  const isFrom = chosen.some((s) => s.priceIsFrom)
  const terms = termsFor(draft.startAt, draft.terms)
  const soon = lateCancelSoon(terms.lateCancelFrom, terms.freeCancelMinutes, now)
  // A booking within the hour can't be moved, so no earlier time could be offered (the backend leaves it off too)
  const canAlert = isAtLeastMinutesAway(draft.startAt, LATE_CANCEL_MIN)
  const earlierAlert = canAlert && Boolean(draft.earlierAlert)

  function submit() {
    if (!draft?.startAt) return
    setError(null)
    book.mutate(
      { salonId: id, serviceIds: sendIds, startAt: draft.startAt, idempotencyKey: draft.idempotencyKey, earlierAlert },
      {
        onSuccess: (booking) => {
          setLeaving(true)
          navigate(`/bookings/${booking.id}?new=1`, { replace: true })
          clear()
        },
        onError: (e) => {
          if (isApiError(e, 'SLOT_TAKEN')) {
            setLeaving(true)
            pickSlot(null)
            newAttempt()
            navigate(`/salons/${id}/book`, { replace: true, state: { slotTaken: true } })
            return
          }
          if (isApiError(e, 'PROFILE_INCOMPLETE')) {
            // The saved profile was out of date: refresh it, finish the missing step, then come back here
            const missing = (e.details.missing as string[] | undefined) ?? []
            rememberReturn(`/salons/${id}/confirm`)
            void authApi.me().then(setUser).catch(() => {})
            setLeaving(true)
            navigate(missing.includes('email') ? '/welcome/email' : '/welcome/name')
            return
          }
          if (isApiError(e, 'IDEMPOTENCY_KEY_REUSED')) {
            // An earlier try with this key (one whose answer never arrived) may have booked already.
            newAttempt()
            void qc.invalidateQueries({ queryKey: ['bookings'] })
            setError({
              code: e.code,
              message: 'Your earlier try may already have booked. Check My bookings before booking again.',
            })
            return
          }
          if (isApiError(e) && FINAL.has(e.code)) newAttempt()
          const until = isApiError(e, 'BOOKING_BLOCKED') && typeof e.details.until === 'string' ? e.details.until : null
          setError({
            code: isApiError(e) ? e.code : 'UNKNOWN',
            message: until ? `${messageOf(e)} You can book online again from ${dateTimeIst(until)}.` : messageOf(e),
          })
        },
      },
    )
  }

  return (
    <Page
      back={`/salons/${id}/book`}
      title="Confirm booking"
      footer={
        <Button className="w-full" busy={book.isPending} disabled={sendIds.length === 0} onClick={submit}>
          Book now
        </Button>
      }
    >
      {timeGone && (
        <Banner tone="warn">
          That time isn't free any more.{' '}
          <button type="button" className="underline" onClick={() => navigate(`/salons/${id}/book`)}>
            Pick another time
          </button>
        </Banner>
      )}
      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-lg font-semibold">{salon.data?.name}</p>
          <p className="text-sm text-muted">
            {salon.data?.area}, {salon.data?.city}
          </p>
        </div>
        <p className="text-xl font-bold text-link">{dateTimeIst(draft.startAt)}</p>
        <ul className="flex flex-col gap-1 border-t border-line pt-3">
          {chosen.map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span>
                {s.name} <span className="text-sm text-muted">· {duration(s.durationMinutes)}</span>
              </span>
              <span>{rupees(s.pricePaise, s.priceIsFrom)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line pt-3 font-semibold">
          <span>Total · about {duration(minutes)}</span>
          <span>
            {offer && (
              <>
                <s className="font-normal text-muted">{rupees(slotPrice.listPricePaise!, isFrom)}</s>{' '}
              </>
            )}
            <span className={offer ? 'text-accent' : ''}>{rupees(paise, isFrom)}</span>
          </span>
        </div>
        {offer && <p className="text-sm text-accent">The salon's offer price at this time.</p>}
      </Card>
      {soon &&
        (Date.parse(terms.lateCancelFrom) <= now ? (
          <Banner tone="warn">
            This time starts within the hour, so the booking can't be moved. Cancelling more than{' '}
            {terms.freeCancelMinutes} minutes after booking counts as a late cancel.
          </Banner>
        ) : (
          <Banner tone="warn">
            This time starts in just over an hour. You can move it until {timeIst(terms.lateCancelFrom)}, and cancel it
            for free until{' '}
            {timeIst(new Date(Math.max(Date.parse(terms.lateCancelFrom), now + terms.freeCancelMinutes * 60_000)).toISOString())}.
          </Banner>
        ))}
      {canAlert && (
        <Card>
          <Switch
            label="Tell me if an earlier time opens"
            hint="If someone cancels earlier that day, we'll send you a message. You choose whether to move."
            on={earlierAlert}
            onChange={setEarlierAlert}
          />
        </Card>
      )}
      <p className="text-sm text-muted">
        Pay at the salon. Arrive on time: if you're more than 10 minutes late, the booking may be marked a no-show.
        You can cancel or move it from My bookings.
      </p>
      {error && (
        <Banner tone="bad">
          {error.message}
          {(error.code === 'TOO_MANY_BOOKINGS' || error.code === 'IDEMPOTENCY_KEY_REUSED') && (
            <>
              {' '}
              <button type="button" className="underline" onClick={() => navigate('/bookings')}>
                See my bookings
              </button>
            </>
          )}
        </Banner>
      )}
    </Page>
  )
}
