import { useEffect, useRef } from 'react'
import { isApiError, salonReadMessage } from '../../api/errors'
import { useUpcomingBookings } from '../../api/bookings'
import { daysShown, useSlots } from '../../api/salons'
import type { Slot } from '../../api/types'
import { clashesWithMine } from './clash'
import { Banner, Button, Chip, EmptyState, ErrorState, Loading } from '../../components/ui'
import { clock12, dayLabel, endTimeIst, nextDates } from '../../lib/ist'
import type { CancelTerms, SlotPrice } from '../../store/bookingDraft'
import { useT } from '../../i18n'

export function DateChips({ value, onChange, maxDaysAhead }: { value: string; onChange: (d: string) => void; maxDaysAhead?: number }) {
  const t = useT()
  // The picked day is kept in sight (a day picked by "Try Wed 3 Dec" can be past the edge of a small phone)
  const row = useRef<HTMLDivElement>(null)
  const picked = useRef(false)
  useEffect(() => {
    const chip = row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    // Picked by a button that has now gone ("Try Wed 3 Dec"): focus goes to the day, so it is known which one shows
    // (not when the screen opens: then the page starts from its title)
    if (picked.current && document.activeElement === document.body) chip?.focus()
    picked.current = true
  }, [value])
  return (
    <div ref={row} role="group" aria-label={t('salon.dayLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {nextDates(daysShown(maxDaysAhead)).map((d) => (
        <Chip key={d} selected={d === value} onClick={() => onChange(d)}>
          {dayLabel(d)}
        </Chip>
      ))}
    </div>
  )
}

/** The free start times for these services on this day. */
export function SlotGrid({
  salonId,
  serviceIds,
  date,
  selected,
  onPick,
  exclude,
  moving,
  minutes,
  onSelectedGone,
  onDate,
  maxDaysAhead,
  closedDates,
}: {
  /** The salon's closed days ahead: never offered as "Try …". */
  closedDates?: string[]
  /** No free times on this day: offers the next day shown, picked with this. */
  onDate?: (d: string) => void
  /** How far ahead the salon takes bookings (the days shown), for "Try the next day". */
  maxDaysAhead?: number
  salonId: string
  serviceIds: string[]
  date: string
  selected: string | null
  /**
   * @param terms the time's cancel terms, when the backend gave them
   * @param price what the services cost at that time (with the salon's offer there), when the backend gave it
   */
  onPick: (startAt: string, terms: CancelTerms | null, price: SlotPrice | null) => void
  /** A start time not to offer (the booking's own time, when moving it). */
  exclude?: string
  /** The booking being moved: its own time counts as free. */
  moving?: string
  /** How long the visit is, for the end shown under each time: the booking's own length when moving it (else the
   * availability answer's, the services picked) */
  minutes?: number
  /** The picked time is no longer free (a refresh found it taken): the screen clears it and says so. */
  onSelectedGone?: () => void
}) {
  const t = useT()
  const slots = useSlots(salonId, serviceIds, date, moving)
  // My own bookings (the cached list My bookings and Home use): times that clash with them are left out
  const mine = useUpcomingBookings({ staleTime: 30_000 })
  // The times shown: the backend's free ones, without the booking's own time when moving, nor any that clash with my
  // own bookings (those arrive on their own: a time picked before they did can turn out to clash)
  const length = slots.data ? (minutes ?? slots.data.durationMinutes) : 0
  const shown = (list: Slot[]) =>
    list.filter((s) => s.startAt !== exclude && !clashesWithMine(s.startAt, length, mine.data ?? [], moving))
  const fresh = slots.data && !slots.isError ? shown(slots.data.starts) : null
  // The booking's own time (when moving) is never "gone": it becomes the picked time the moment a move succeeds
  const selectedGone =
    selected !== null && selected !== exclude && fresh !== null && !fresh.some((s) => s.startAt === selected)

  useEffect(() => {
    if (selectedGone) onSelectedGone?.()
  }, [selectedGone, onSelectedGone])

  if (slots.isPending) return <Loading label={t('salon.checkingTimes')} />
  // A refresh that failed keeps the times already shown (with a note); only a first read that failed has nothing to show
  if (slots.isError && !slots.data) {
    if (isApiError(slots.error, 'OUTSIDE_WINDOW')) {
      return <EmptyState title={t('salon.notOpenForBooking')} body={slots.error.message} />
    }
    if (isApiError(slots.error, 'NO_BARBER_FOR_SERVICES')) {
      return (
        <EmptyState
          title={t('salon.noBarberTitle')}
          body={t('salon.noBarberBody')}
        />
      )
    }
    return <ErrorState message={salonReadMessage(slots.error)} onRetry={() => slots.refetch()} />
  }
  const free = slots.data.freeCancelMinutes
  const termsOf = (s: { startAt: string; lateCancelFrom?: string }): CancelTerms | null =>
    s.lateCancelFrom && typeof free === 'number' ? { startAt: s.startAt, lateCancelFrom: s.lateCancelFrom, freeCancelMinutes: free } : null
  const priceOf = (s: { startAt: string; pricePaise?: number; listPricePaise?: number | null }): SlotPrice | null =>
    typeof s.pricePaise === 'number' ? { startAt: s.startAt, pricePaise: s.pricePaise, listPricePaise: s.listPricePaise ?? null } : null
  const starts = shown(slots.data.starts)
  const anyOffer = starts.some((s) => s.listPricePaise != null)
  const stale = slots.isError ? (
    <Banner tone="warn">{t('salon.timesStale')}</Banner>
  ) : null
  // Only once the salon's own window is known (else a day it doesn't take could be offered); its closed days skipped
  const days = maxDaysAhead === undefined ? [] : nextDates(daysShown(maxDaysAhead))
  const next = days.slice(days.indexOf(date) + 1).find((d) => !closedDates?.includes(d))
  if (starts.length === 0) {
    return (
      <>
        {stale}
        <EmptyState
          title={t('salon.noFreeTimes')}
          body={t('salon.noFreeTimesBody')}
          action={next && onDate ? <Button variant="secondary" onClick={() => onDate(next)}>{t('salon.tryDay', { day: dayLabel(next) })}</Button> : undefined}
        />
      </>
    )
  }

  const groups = [
    { id: 'morning', name: t('salon.morning'), list: starts.filter((s) => s.time < '12:00') },
    { id: 'afternoon', name: t('salon.afternoon'), list: starts.filter((s) => s.time >= '12:00' && s.time < '17:00') },
    { id: 'evening', name: t('salon.evening'), list: starts.filter((s) => s.time >= '17:00') },
  ].filter((g) => g.list.length)
  // The % mark is styled inside the sentence: one text, split where the mark goes
  const [markBefore, markAfter = ''] = t('salon.offerMarkNote').split('{mark}')

  return (
    <div className="flex flex-col gap-4">
      {stale}
      {anyOffer && (
        <p className="text-sm text-muted">
          {markBefore}
          <span className="font-semibold text-accent">%</span>
          {markAfter}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.id} aria-label={g.name} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">{g.name}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.list.map((s) => (
              <Chip compact key={s.startAt} selected={s.startAt === selected} onClick={() => onPick(s.startAt, termsOf(s), priceOf(s))}>
                {/* The start, and under it when the visit ends (start + the picked services' time) */}
                <span className="flex flex-col items-center py-1 leading-tight whitespace-nowrap">
                  <span>
                    {clock12(s.time)}
                    {s.listPricePaise != null && (
                      <span aria-hidden className={s.startAt === selected ? '' : 'font-semibold text-accent'}>
                        {' '}
                        %
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-normal"> {t('salon.slotEnds', { time: endTimeIst(s.startAt, length) })}</span>
                </span>
                {s.listPricePaise != null && <span className="sr-only">, {t('salon.offerPriceSr')}</span>}
              </Chip>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
