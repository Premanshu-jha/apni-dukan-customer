import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useBooking, useCancelBooking, useEarlierAlert, useMoveBooking } from '../../api/bookings'
import { isApiError, messageOf } from '../../api/errors'
import { Banner, Button, Card, ErrorState, Loading, Page, Sheet, Switch } from '../../components/ui'
import { useT } from '../../i18n'
import { dateTimeIst, minutesUntil, timeIst } from '../../lib/ist'
import { duration, rupees } from '../../lib/money'
import { NotificationsPrompt } from '../profile/Notifications'
import { RateVisit } from '../ratings/RateVisit'
import { StatusPill } from './StatusPill'
import { cancelIsLate, lateCancelFromOf } from './lateCancel'
import { earlierOffer, isEarlier } from './status'
import { serviceName } from '../../lib/serviceName'
import { ServiceIcon } from '../../components/ServiceIcon'
import { Hint } from '../guide/Hint'
import { VisitTip } from '../guide/HomeGuide'
import { CallUs } from '../help/CallUs'

/** The reason the backend gives a missed mark the salon took back (SalonDayService.undoNoShow). */
const NO_SHOW_UNDONE = 'No-show undone'

/** Bookings can't be moved within this many minutes of the start (the backend's TOO_LATE_TO_MOVE). */
const NO_MOVE_MIN = 60

export function BookingDetail() {
  const t = useT()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const justBooked = params.get('new') === '1'
  const earlier = earlierOffer(params.get('earlier'))
  // Opened from "How was your visit?"
  const toRate = params.get('rate') === '1'
  const booking = useBooking(id)
  const cancel = useCancelBooking()
  const earlierSwitch = useEarlierAlert()
  const move = useMoveBooking()
  const [asking, setAsking] = useState(false)
  // Back from Move booking: say it worked, at the top, in focus
  const here = useLocation()
  const [movedTo] = useState(() => (here.state as { movedTo?: string } | null)?.movedTo)
  const [note, setNote] = useState<string | null>(() => (movedTo ? t('bookings.movedTo', { when: dateTimeIst(movedTo) }) : null))
  // Said once: the history entry forgets it (Back to here, or a reload, doesn't say it again)
  useEffect(() => {
    if (movedTo) void navigate(here.pathname + here.search, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the screen opens
  }, [])
  // Another offer opened on this same screen (from the bell): the last offer's answer no longer applies
  const resetMove = move.reset
  useEffect(() => resetMove(), [earlier, resetMove])
  // After a move from the offer card, focus goes to the result (the card it was in is gone)
  const offerRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLDivElement>(null)
  const focusNote = useRef(movedTo !== undefined)
  useEffect(() => {
    if (note && focusNote.current && noteRef.current) {
      focusNote.current = false
      noteRef.current.focus()
      noteRef.current.scrollIntoView?.({ block: 'center' })
    }
  })

  if (booking.isPending) {
    return (
      <Page back="/bookings" title={t('bookings.bookingTitle')}>
        <Loading />
      </Page>
    )
  }
  if (booking.isError) {
    return (
      <Page back="/bookings" title={t('bookings.bookingTitle')}>
        <ErrorState message={messageOf(booking.error)} onRetry={() => booking.refetch()} />
      </Page>
    )
  }

  const b = booking.data
  const minutes = b.services.reduce((sum, s) => sum + s.durationMinutes, 0)
  const withinHour = minutesUntil(b.startsAt) < NO_MOVE_MIN
  // From the booking's own lateCancelFrom: a booking made for soon is free to cancel for its first 10 minutes
  const late = cancelIsLate(b)

  return (
    <Page back="/bookings" title={t('bookings.bookingNo', { no: b.bookingNo })} help={{ about: t('bookings.helpAbout', { no: b.bookingNo }) }}>
      {justBooked && b.status === 'CONFIRMED' && <Banner tone="good">{t('bookings.justBooked', { time: timeIst(b.startsAt) })}</Banner>}
      {note && (
        <div ref={noteRef} tabIndex={-1} role="status" className="outline-none">
          <Banner tone="info">{note}</Banner>
        </div>
      )}

      {earlier && b.status === 'CONFIRMED' && isEarlier(earlier, b.startsAt) && (
        <div ref={offerRef} tabIndex={-1} className="outline-none">
          <Card className="flex flex-col gap-3">
            <p className="font-semibold">{t('bookings.earlierOpened', { when: dateTimeIst(earlier) })}</p>
            {!b.canMove ? (
              <p className="text-sm text-muted">
                {t('bookings.earlierCantMove', { time: timeIst(b.startsAt) })}
              </p>
            ) : minutesUntil(earlier) <= 0 ? (
              <p className="text-sm text-muted">{t('bookings.earlierPassed', { time: timeIst(b.startsAt) })}</p>
            ) : isApiError(move.error, 'SLOT_TAKEN') || isApiError(move.error, 'OUTSIDE_WINDOW') ? (
              <>
                <Banner tone="warn">
                  {isApiError(move.error, 'SLOT_TAKEN')
                    ? t('bookings.earlierTaken', { time: timeIst(earlier), current: timeIst(b.startsAt) })
                    : t('bookings.earlierTooSoon', { time: timeIst(earlier), current: timeIst(b.startsAt) })}
                </Banner>
                <Button variant="secondary" onClick={() => navigate(`/bookings/${b.id}/move`)}>
                  {t('bookings.seeOtherTimes')}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  {t('bookings.earlierFirstWins', { time: timeIst(b.startsAt) })}
                </p>
                {move.isError && <Banner tone="bad">{messageOf(move.error)}</Banner>}
                <Button
                  busy={move.isPending}
                  onClick={() =>
                    move.mutate(
                      { id: b.id, salonId: b.salonId, startAt: earlier },
                      {
                        onSuccess: (moved) => {
                          setNote(t('bookings.movedTo', { when: dateTimeIst(moved.startsAt) }))
                          setParams({}, { replace: true })
                          focusNote.current = true
                        },
                        // The button is replaced by the answer: keep focus on the card, not the page top
                        onError: () => offerRef.current?.focus(),
                      },
                    )
                  }
                >
                  {t('bookings.moveTo', { time: timeIst(earlier) })}
                </Button>
              </>
            )}
          </Card>
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold break-words">{b.salonName}</p>
            <p className="text-sm text-muted">{b.salonAddress}</p>
          </div>
          <StatusPill status={b.status} />
        </div>
        <p className="text-xl font-bold text-link">{dateTimeIst(b.startsAt)}</p>
        {b.mapLink && (
          <a href={b.mapLink} target="_blank" rel="noreferrer" className="text-sm text-link underline">
            {t('bookings.directions')}
          </a>
        )}
      </Card>

      {/* A first booking's page: what it is for (once per account) */}
      {b.status === 'CONFIRMED' && b.startCode && <Hint name="hint.booking">{t('guide.hintBooking')}</Hint>}
      {b.status === 'CONFIRMED' && b.startCode && (
        <Card className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-muted">{t('bookings.showCode')}</p>
          <p aria-label={t('bookings.startCode', { code: b.startCode.split('').join(' ') })} className="font-mono text-5xl font-bold tracking-[0.3em]">
            {b.startCode}
          </p>
          <p className="text-sm text-muted">{t('bookings.arriveBy', { time: timeIst(b.heldUntil) })}</p>
          {b.canMove && !withinHour ? (
            <Link to={`/bookings/${b.id}/move`} className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline">
              {t('bookings.runningLate')}
            </Link>
          ) : (
            // Too late to move: what being late means here, and a person to tell
            <p className="text-sm">{t('bookings.runningLateSoon', { time: timeIst(b.heldUntil) })}</p>
          )}
        </Card>
      )}
      {/* Marked missed, or cancelled by the salon: "this is wrong" right here, with what happened already written */}
      {b.status === 'NO_SHOW' && (
        <Banner tone="warn">
          {t('bookings.missedByMistake')}{' '}
          <Link
            to={`/help?${new URLSearchParams({
              about: t('howto.missedSubject'),
              text: t('bookings.missedText', { no: b.bookingNo, when: dateTimeIst(b.startsAt), salon: b.salonName }),
            })}`}
            className="font-semibold underline"
          >
            {t('bookings.tellUs')}
          </Link>
        </Banner>
      )}
      {/* Cancelled by the salon (not the salon taking back a missed mark: that is good news, nothing to do) */}
      {b.status === 'CANCELLED_BY_SALON' && b.cancelReason !== NO_SHOW_UNDONE && (
        <div className="flex flex-col gap-2">
          <Link to={`/salons/${b.salonId}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink">
            {t('bookings.bookAnotherTime')}
          </Link>
          <Link
            to={`/help?${new URLSearchParams({
              about: t('bookings.helpAbout', { no: b.bookingNo }),
              text: t('bookings.salonCancelledText', { no: b.bookingNo, salon: b.salonName }),
            })}`}
            className="py-1 text-center text-sm text-link underline"
          >
            {t('bookings.tellUsWhatHappened')}
          </Link>
        </div>
      )}

      {b.cancelReason && (b.status === 'CANCELLED_BY_SALON' || b.status === 'CANCELLED_BY_CUSTOMER') && (
        <Banner tone={b.status === 'CANCELLED_BY_SALON' ? 'bad' : 'info'}>{t('bookings.reason', { reason: b.cancelReason })}</Banner>
      )}

      <Card className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1">
          {b.services.map((s) => (
            <li key={s.serviceId} className="flex justify-between gap-3">
              <span className="flex items-center gap-2">
                {/* The picture its name fits, so the service is known without reading */}
                <ServiceIcon service={s} size={18} className="text-link" />
                <span>
                  {serviceName(s.name)} <span className="text-sm text-muted">· {duration(s.durationMinutes)}</span>
                </span>
              </span>
              <span>
                {s.listPricePaise != null && <s className="text-sm text-muted">{rupees(s.listPricePaise, s.priceIsFrom)}</s>}{' '}
                <span className={s.listPricePaise != null ? 'text-accent' : ''}>{rupees(s.pricePaise, s.priceIsFrom)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line pt-2 font-semibold">
          <span>{t('bookings.totalAbout', { duration: duration(minutes) })}</span>
          <span>
            {b.totalListPricePaise != null && (
              <s className="font-normal text-muted">{rupees(b.totalListPricePaise, b.priceIsFrom)}</s>
            )}{' '}
            <span className={b.totalListPricePaise != null ? 'text-accent' : ''}>{rupees(b.totalPricePaise, b.priceIsFrom)}</span>
          </span>
        </div>
        {b.totalListPricePaise != null && <p className="text-sm text-accent">{t('bookings.offerPrice')}</p>}
        <p className="text-sm text-muted">{t('bookings.payAtSalon')}</p>
      </Card>

      {b.status === 'COMPLETED' && <RateVisit booking={b} focus={toRate} />}
      {/* After a finished visit, once: come-back reminders and offer messages, switched right here */}
      {b.status === 'COMPLETED' && <VisitTip />}

      {justBooked && <NotificationsPrompt />}

      {b.status === 'CONFIRMED' && b.canMove && (
        <Card className="flex flex-col gap-2">
          <Switch
            label={t('bookings.earlierAlert')}
            hint={t('bookings.earlierAlertHint')}
            on={Boolean(b.earlierAlert)}
            busy={earlierSwitch.isPending}
            onChange={(on) => earlierSwitch.mutate({ id: b.id, on })}
          />
          {earlierSwitch.isError && <Banner tone="bad">{messageOf(earlierSwitch.error)}</Banner>}
        </Card>
      )}

      {(b.canMove || b.canChange) && (
        <div className="flex flex-col gap-2">
          {b.canMove ? (
            <Button variant="secondary" onClick={() => navigate(`/bookings/${b.id}/move`)}>
              {t('bookings.moveToAnother')}
            </Button>
          ) : (
            b.canChange && (
              <p className="text-center text-sm text-muted">
                {withinHour
                  ? t('bookings.noMoveWithinHour')
                  : t('bookings.salonNotTakingChanges')}
              </p>
            )
          )}
          {b.canChange && (
            <p className="text-center text-sm text-muted">
              {late
                ? t('bookings.cancelNowLate')
                : t('bookings.freeToCancel', { when: dateTimeIst(lateCancelFromOf(b)) })}
            </p>
          )}
          {b.canChange && (
            <Button variant="danger" onClick={() => setAsking(true)}>
              {t('bookings.cancelBooking')}
            </Button>
          )}
        </div>
      )}

      <p className="text-center text-sm text-muted">
        <Link to={`/salons/${b.salonId}`} className="underline">
          {t('bookings.bookAgain', { salon: b.salonName })}
        </Link>
      </p>

      <Sheet open={asking} title={t('bookings.cancelTitle')} onClose={() => setAsking(false)}>
        <div className="flex flex-col gap-4">
          {late ? (
            <Banner tone="warn">
              {t('bookings.lateCancelWarning', { time: timeIst(lateCancelFromOf(b)) })}
            </Banner>
          ) : (
            <p className="text-muted">{t('bookings.cancelInfo')}</p>
          )}
          {cancel.isError && <Banner tone="bad">{messageOf(cancel.error)}</Banner>}
          <Button
            variant="danger"
            busy={cancel.isPending}
            onClick={() =>
              cancel.mutate(b.id, {
                onSuccess: (r) => {
                  setAsking(false)
                  // The cancel button was far down the page: the answer is brought into sight
                  focusNote.current = true
                  setNote(r.countedAsLate ? t('bookings.cancelledLate') : t('bookings.cancelled'))
                },
              })
            }
          >
            {t('bookings.yesCancel')}
          </Button>
          <Button variant="secondary" onClick={() => setAsking(false)}>
            {t('bookings.keepIt')}
          </Button>
        </div>
      </Sheet>
      <Link
        to={`/help?${new URLSearchParams({
          about: t('bookings.helpAbout', { no: b.bookingNo }),
          text: t('bookings.helpText', { no: b.bookingNo }),
        })}`}
        className="py-2 text-center text-sm text-link underline"
      >
        {t('bookings.needHelp')}
      </Link>
      <CallUs about={t('bookings.helpAbout', { no: b.bookingNo })} />
    </Page>
  )
}
