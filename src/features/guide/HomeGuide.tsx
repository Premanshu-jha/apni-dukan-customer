import { useState } from 'react'
import { Link } from 'react-router'
import { useLastVisit, useUpcomingBookings } from '../../api/bookings'
import { usePlaces } from '../../api/places'
import { Button, Card } from '../../components/ui'
import { useT } from '../../i18n'
import { SalonMessageSwitches } from '../profile/SalonMessageSwitches'
import { BOOKING_RULES } from './rules'
import { TipIcon } from './Hint'
import { useOnce } from './once'

/** Home asks for the bookings at most this often: the same as "Your booking" (one request for both). */
const HOME_STALE_MS = 30_000

/**
 * Whether this person has never booked: nothing upcoming and no past booking at all. Read with the same queries as
 * "Your booking" on Home (same keys, so no extra request); unknown (loading, offline) counts as no.
 */
function useBookingHistory() {
  const upcoming = useUpcomingBookings({ staleTime: HOME_STALE_MS })
  const nothingAhead = upcoming.isSuccess && upcoming.data.length === 0
  const last = useLastVisit({ enabled: nothingAhead })
  return {
    /** Both read (or something is coming up): whether they booked is known */
    known: upcoming.isSuccess && (!nothingAhead || last.isSuccess),
    neverBooked: nothingAhead && last.isSuccess && last.data === null,
    lastVisit: nothingAhead && last.isSuccess ? last.data : null,
  }
}

function StepIcon({ kind }: { kind: 'services' | 'time' | 'code' }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'services' && (
        <>
          <rect x="3.5" y="4" width="5" height="5" rx="1" />
          <path d="m4.8 6.6 1.1 1.1 1.8-2" />
          <path d="M11.5 6.5h9" />
          <rect x="3.5" y="14" width="5" height="5" rx="1" />
          <path d="M11.5 16.5h9" />
        </>
      )}
      {kind === 'time' && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      )}
      {kind === 'code' && (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 12h.01M10.3 12h.01M13.6 12h.01M17 12h.01" strokeWidth="2.6" />
        </>
      )}
    </svg>
  )
}

/** Whether Home shows How booking works now: never booked, and not dismissed by this account. */
function useHowItWorksShown(): { known: boolean; shown: boolean; dismiss: () => void } {
  const { known, neverBooked } = useBookingHistory()
  const [notDismissed, dismiss] = useOnce('howItWorks')
  return { known, shown: neverBooked && notDismissed, dismiss }
}

/**
 * On Home for someone who has never booked: one line, "How booking works ›", so the search box and the salons stay
 * on a small phone's first screen. Tapped, it opens: how booking works in three pictures (tick services, pick a time,
 * show your code and pay at the salon) and the one rule worth knowing first. "Got it" (on the line, or opened) hides
 * it for this account; it also goes by itself once they have booked.
 */
export function HowItWorks() {
  const t = useT()
  const { shown, dismiss } = useHowItWorksShown()
  const [open, setOpen] = useState(false)
  if (!shown) return null
  const steps = [
    { kind: 'services' as const, text: t('guide.stepServices') },
    { kind: 'time' as const, text: t('guide.stepTime') },
    { kind: 'code' as const, text: t('guide.stepCode') },
  ]
  return (
    <section aria-labelledby="how-it-works">
      <Card className={`flex flex-col gap-3 ${open ? '' : 'py-0 pr-1'}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="how-it-works" className={`min-w-0 font-semibold ${open ? 'font-display text-lg' : ''}`}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="how-it-works-steps"
              onClick={() => setOpen(!open)}
              className="flex min-h-11 items-center gap-2 text-left text-link"
            >
              <TipIcon />
              <span>{t('guide.howItWorksTitle')}</span>
              <span aria-hidden className={`transition ${open ? 'rotate-90' : ''}`}>
                ›
              </span>
            </button>
          </h2>
          {!open && (
            <button type="button" onClick={dismiss} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-raised hover:text-ink">
              {t('guide.gotIt')}
            </button>
          )}
        </div>
        {open && (
          <div id="how-it-works-steps" className="flex flex-col gap-3">
            <ol className="grid grid-cols-3 gap-2">
              {steps.map((s, i) => (
                <li key={s.kind} className="flex flex-col items-center gap-1.5 rounded-xl bg-raised px-1.5 py-3 text-center text-sm">
                  <span className="text-link">
                    <StepIcon kind={s.kind} />
                  </span>
                  <span>
                    <span className="font-semibold">{i + 1}. </span>
                    {s.text}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted">
              <RulesText />
            </p>
            <div className="flex items-center justify-between gap-3">
              <Link to="/help" className="inline-flex min-h-11 items-center text-sm text-link underline">
                {t('guide.moreAnswers')}
              </Link>
              <Button variant="secondary" onClick={dismiss}>
                {t('guide.gotIt')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  )
}

/** The booking rules in one line, with the backend's real numbers. */
function RulesText() {
  const t = useT()
  return <>{t('guide.rulesLine', BOOKING_RULES)}</>
}

/**
 * After a finished visit, once: the two salon messages most people want (time to come back, a salon's offer), with
 * their switches right here (the same as in Profile). Both are on unless switched off; "Got it" hides the card.
 */
export function VisitTip() {
  const t = useT()
  const [shown, dismiss] = useOnce('visitTip')
  if (!shown) return null
  return (
    <section aria-labelledby="visit-tip">
      <Card className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-link">
            <TipIcon />
          </span>
          <div>
            <h2 id="visit-tip" className="font-semibold">
              {t('guide.visitTipTitle')}
            </h2>
            <p className="text-sm text-muted">{t('guide.visitTipBody')}</p>
          </div>
        </div>
        <SalonMessageSwitches />
        <div className="flex items-center justify-between gap-3">
          <Link to="/profile#messages" className="inline-flex min-h-11 items-center text-sm text-link underline">
            {t('guide.visitTipProfile')}
          </Link>
          <Button variant="secondary" onClick={dismiss}>
            {t('guide.gotIt')}
          </Button>
        </div>
      </Card>
    </section>
  )
}

/** On Home: the visit tip, when the latest booking is a finished visit (and nothing is coming up). */
export function HomeVisitTip() {
  const { lastVisit } = useBookingHistory()
  if (lastVisit?.status !== 'COMPLETED') return null
  return <VisitTip />
}

/**
 * Under Home's location bar, for someone with no saved place yet: once, that Home or Work can be saved and salons
 * found near them from anywhere. Uses Home's own list of places (no extra request). Not while How booking works is
 * on Home (one tip at a time, so the search box and the salons stay on a small phone's first screen); nor before
 * it is known whether that shows (no tip that appears and then goes).
 */
export function PlacesHint() {
  const t = useT()
  const places = usePlaces()
  const [shown, dismiss] = useOnce('placesHint')
  const howItWorks = useHowItWorksShown()
  if (!shown || !places.isSuccess || places.data.length > 0 || !howItWorks.known || howItWorks.shown) return null
  return (
    <div role="note" className="flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
      <span className="text-link">
        <TipIcon />
      </span>
      <p className="min-w-0 flex-1">
        {t('guide.placesHint')}{' '}
        <Link to="/places" className="font-semibold text-link underline">
          {t('guide.placesHintLink')}
        </Link>
      </p>
      <button type="button" onClick={dismiss} className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-link hover:bg-raised">
        {t('guide.gotIt')}
      </button>
    </div>
  )
}
