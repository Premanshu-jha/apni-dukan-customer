import { useState } from 'react'
import { Link } from 'react-router'
import { useMyBookings } from '../../api/bookings'
import { messageOf } from '../../api/errors'
import { Chip, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { StatusPill } from './StatusPill'

export function MyBookings() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const list = useMyBookings(when)

  return (
    <Page title="My bookings">
      <div role="group" aria-label="Which bookings" className="flex gap-2">
        <Chip selected={when === 'upcoming'} onClick={() => setWhen('upcoming')}>
          Upcoming
        </Chip>
        <Chip selected={when === 'past'} onClick={() => setWhen('past')}>
          Past
        </Chip>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState
          title={when === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}
          body={when === 'upcoming' ? 'Find a salon near you and book a time.' : undefined}
          action={
            when === 'upcoming' ? (
              <Link to="/" className="text-brand underline">
                Find a salon
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.data.map((b) => (
            <li key={b.id}>
              <Link
                to={`/bookings/${b.id}`}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 transition hover:bg-raised"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{b.salonName}</p>
                  <StatusPill status={b.status} />
                </div>
                <p className="text-brand">{dateTimeIst(b.startsAt)}</p>
                <p className="truncate text-sm text-muted">
                  {b.services.map((s) => s.name).join(', ')} · {rupees(b.totalPricePaise, b.priceIsFrom)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
