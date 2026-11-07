import { isApiError, salonReadMessage } from '../../api/errors'
import { daysShown, useSlots } from '../../api/salons'
import { Chip, EmptyState, ErrorState, Loading } from '../../components/ui'
import { clock12, dayLabel, nextDates } from '../../lib/ist'
import type { CancelTerms } from '../../store/bookingDraft'

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
}: {
  salonId: string
  serviceIds: string[]
  date: string
  selected: string | null
  /** @param terms the time's cancel terms, when the backend gave them */
  onPick: (startAt: string, terms: CancelTerms | null) => void
  /** A start time not to offer (the booking's own time, when moving it). */
  exclude?: string
  /** The booking being moved: its own time counts as free. */
  moving?: string
}) {
  const slots = useSlots(salonId, serviceIds, date, moving)

  if (slots.isPending) return <Loading label="Checking free times…" />
  if (slots.isError) {
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
  const starts = slots.data.starts.filter((s) => s.startAt !== exclude)
  if (starts.length === 0) {
    return <EmptyState title="No free times" body="The salon is fully booked or closed on this day. Try another day." />
  }

  const groups = [
    { name: 'Morning', list: starts.filter((s) => s.time < '12:00') },
    { name: 'Afternoon', list: starts.filter((s) => s.time >= '12:00' && s.time < '17:00') },
    { name: 'Evening', list: starts.filter((s) => s.time >= '17:00') },
  ].filter((g) => g.list.length)

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">{g.name}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.list.map((s) => (
              <Chip key={s.startAt} selected={s.startAt === selected} onClick={() => onPick(s.startAt, termsOf(s))}>
                {clock12(s.time)}
              </Chip>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
