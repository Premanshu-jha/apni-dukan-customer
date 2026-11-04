import { Link } from 'react-router'
import { isApiError, messageOf } from '../../api/errors'
import { useNearbySalons } from '../../api/salons'
import { EmptyState, ErrorState, Loading } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'


export function SalonList({ lat, lng }: { lat: number; lng: number }) {
  const salons = useNearbySalons(lat, lng)

  if (salons.isPending) return <Loading label="Looking for salons near you…" />
  if (salons.isError) {
    // The backend answers VALIDATION_FAILED on lat/lng for a point outside India
    if (isApiError(salons.error, 'VALIDATION_FAILED')) {
      return (
        <EmptyState
          title="Apni Dukan works only in India"
          body="Your location seems to be outside India. Open the app when you're in India, or tap Update after moving."
        />
      )
    }
    return <ErrorState message={messageOf(salons.error)} onRetry={() => salons.refetch()} />
  }
  if (salons.data.length === 0) {
    return (
      <EmptyState
        title="No salons near you yet"
        body="We're adding salons area by area. Tell us where you are and we'll come to you sooner."
        action={
          <a
            className="text-brand underline"
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Please add salons near me')}&body=${encodeURIComponent(`My area: \nLocation: ${lat.toFixed(4)}, ${lng.toFixed(4)}`)}`}
          >
            Let us know
          </a>
        }
      />
    )
  }

  return (
    <section aria-label="Salons near you" className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {salons.data.length} {salons.data.length === 1 ? 'salon' : 'salons'} within 5 km
      </p>
      <ul className="flex flex-col gap-3">
        {salons.data.map((s) => (
          <li key={s.id}>
            <Link
              to={`/salons/${s.id}`}
              className="flex gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:bg-raised"
            >
              <SalonPhoto url={s.photoUrl} name={s.name} />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="truncate text-sm text-muted">
                  {s.area}, {s.city}
                </p>
                <p className="text-sm text-brand">{s.distanceKm.toFixed(1)} km away</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SalonPhoto({ url, name, large = false }: { url: string | null; name: string; large?: boolean }) {
  const size = large ? 'h-48 w-full rounded-2xl' : 'h-20 w-20 rounded-xl'
  if (!url) {
    return (
      <div aria-hidden className={`${size} flex shrink-0 items-center justify-center bg-raised text-3xl text-muted`}>
        ✂
      </div>
    )
  }
  return <img src={url} alt={large ? `${name}` : ''} loading="lazy" className={`${size} shrink-0 object-cover`} />
}
