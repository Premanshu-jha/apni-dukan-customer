import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useBook } from '../../api/bookings'
import { isApiError, messageOf } from '../../api/errors'
import { useSalon, useSalonServices } from '../../api/salons'
import { Banner, Button, Card, ErrorState, Loading, Page } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { duration, rupees } from '../../lib/money'
import { useDraft } from '../../store/bookingDraft'
import { useSession } from '../../store/session'
import { authApi } from '../../api/auth'
import { rememberReturn } from '../auth/flow'

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
  const { draft, pickSlot, newAttempt, clear } = useDraft()
  const book = useBook()
  const qc = useQueryClient()
  const setUser = useSession((s) => s.setUser)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  // Set when leaving this screen, so changing the draft on the way out doesn't bounce it back to the salon.
  const [leaving, setLeaving] = useState(false)

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
  if (salon.isError || services.isError) {
    return (
      <Page back={`/salons/${id}/book`} title="Confirm booking">
        <ErrorState
          message={messageOf(salon.error ?? services.error)}
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
  const paise = chosen.reduce((t, s) => t + s.pricePaise, 0)
  const isFrom = chosen.some((s) => s.priceIsFrom)

  function submit() {
    if (!draft?.startAt) return
    setError(null)
    book.mutate(
      { salonId: id, serviceIds: sendIds, startAt: draft.startAt, idempotencyKey: draft.idempotencyKey },
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
      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-lg font-semibold">{salon.data?.name}</p>
          <p className="text-sm text-muted">
            {salon.data?.area}, {salon.data?.city}
          </p>
        </div>
        <p className="text-xl font-bold text-brand">{dateTimeIst(draft.startAt)}</p>
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
          <span>{rupees(paise, isFrom)}</span>
        </div>
      </Card>
      <p className="text-sm text-muted">
        Pay at the salon. Arrive on time: if you're more than 15 minutes late, the booking may be marked a no-show.
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
