import { useEffect } from 'react'
import { isApiError, salonReadMessage } from '../../api/errors'
import { daysShown, useSlots } from '../../api/salons'
import { Banner, Chip, EmptyState, ErrorState, Loading } from '../../components/ui'
import { clock12, dayLabel, nextDates } from '../../lib/ist'
import type { CancelTerms, SlotPrice } from '../../store/bookingDraft'

export function DateChips({ value, onChange, maxDaysAhead }: { value: string; onChange: (d: string) => void; maxDaysAhead?: number }) {
  return (
    <div role="group" aria-label="Day" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
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
  onSelectedGone,
}: {
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
  /** The picked time is no longer free (a refresh found it taken): the screen clears it and says so. */
  onSelectedGone?: () => void
}) {
  const slots = useSlots(salonId, serviceIds, date, moving)
  const fresh = slots.data && !slots.isError ? slots.data.starts : null
  const selectedGone = selected !== null && fresh !== null && !fresh.some((s) => s.startAt === selected)

  useEffect(() => {
    if (selectedGone) onSelectedGone?.()
  }, [selectedGone, onSelectedGone])

  if (slots.isPending) return <Loading label="Checking free times…" />
  // A refresh that failed keeps the times already shown (with a note); only a first read that failed has nothing to show
  if (slots.isError && !slots.data) {
    if (isApiError(slots.error, 'OUTSIDE_WINDOW')) {
      return <EmptyState title="Not open for booking" body={slots.error.message} />
    }
    if (isApiError(slots.error, 'NO_BARBER_FOR_SERVICES')) {
      return (
        <EmptyState
          title="No one barber does all of these"
          body="Take some services off and book them separately."
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
  const starts = slots.data.starts.filter((s) => s.startAt !== exclude)
  const anyOffer = starts.some((s) => s.listPricePaise != null)
  const stale = slots.isError ? (
    <Banner tone="warn">Couldn't check the times again just now. They may have changed: we'll try again shortly.</Banner>
  ) : null
  if (starts.length === 0) {
    return (
      <>
        {stale}
        <EmptyState title="No free times" body="The salon is fully booked or closed on this day. Try another day." />
      </>
    )
  }

  const groups = [
    { name: 'Morning', list: starts.filter((s) => s.time < '12:00') },
    { name: 'Afternoon', list: starts.filter((s) => s.time >= '12:00' && s.time < '17:00') },
    { name: 'Evening', list: starts.filter((s) => s.time >= '17:00') },
  ].filter((g) => g.list.length)

  return (
    <div className="flex flex-col gap-4">
      {stale}
      {anyOffer && (
        <p className="text-sm text-muted">
          Times marked <span className="font-semibold text-accent">%</span> have the salon's offer price.
        </p>
      )}
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">{g.name}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.list.map((s) => (
              <Chip key={s.startAt} selected={s.startAt === selected} onClick={() => onPick(s.startAt, termsOf(s), priceOf(s))}>
                {clock12(s.time)}
                {s.listPricePaise != null && (
                  <>
                    <span className="sr-only">, offer price</span>
                    <span aria-hidden className={s.startAt === selected ? '' : 'font-semibold text-accent'}>
                      {' '}
                      %
                    </span>
                  </>
                )}
              </Chip>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
