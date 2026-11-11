import { Link, useNavigate } from 'react-router'
import { chosenOf, MAX_PLACES, placeLabel, placeShort, usePlaces, type SavedPlace } from '../../api/places'
import { messageOf } from '../../api/errors'
import { Card, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { useLocation } from '../../store/location'

const ICON: Record<SavedPlace['kind'], string> = { HOME: '⌂', WORK: '▣', OTHER: '◉' }

/**
 * Where to find salons: the phone's current location, or one of the saved places (Home, Work, others), like the
 * address list of a delivery app. Picking one goes back to the salons. Each saved place can be changed from here, and
 * new ones added (up to 10).
 */
export function ChoosePlace() {
  const navigate = useNavigate()
  const places = usePlaces()
  const chosen = useLocation((s) => s.chosen)
  const choose = useLocation((s) => s.choose)
  const pick = (p: SavedPlace | null) => {
    choose(p ? chosenOf(p) : null)
    navigate('/', { replace: true })
  }
  const list = places.data ?? []
  const full = list.length >= MAX_PLACES
  return (
    <Page back="/" title="Find salons near">
      <ul className="flex flex-col gap-2" aria-label="Places">
        <li>
          <button
            type="button"
            onClick={() => pick(null)}
            aria-current={chosen === null ? 'true' : undefined}
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left ${chosen === null ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
          >
            <span aria-hidden className="text-xl">⌖</span>
            <span className="flex-1">
              <span className="block font-semibold">Current location</span>
              <span className="block text-sm text-muted">From your phone's GPS</span>
            </span>
            {chosen === null && <span className="text-sm text-brand">Selected</span>}
          </button>
        </li>
        {list.map((p) => {
          const on = chosen?.id === p.id
          return (
            <li key={p.id} className={`flex items-stretch rounded-xl border ${on ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}>
              <button type="button" onClick={() => pick(p)} aria-current={on ? 'true' : undefined} className="flex min-h-14 flex-1 items-center gap-3 px-4 py-2 text-left">
                <span aria-hidden className="text-xl">{ICON[p.kind]}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{placeLabel(p)}</span>
                  <span className="block text-sm text-muted">
                    {placeShort(p)}, {p.city} {p.pincode}
                  </span>
                </span>
                {on && <span className="text-sm text-brand">Selected</span>}
              </button>
              <Link to={`/places/${p.id}`} className="flex items-center px-4 text-sm text-link" aria-label={`Change ${placeLabel(p)}`}>
                Change
              </Link>
            </li>
          )
        })}
      </ul>

      {places.isPending ? (
        <Loading label="Loading your places…" />
      ) : places.isError && !places.data ? (
        <ErrorState message={messageOf(places.error)} onRetry={() => places.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="No saved places yet" body="Save Home, Work or any address to find salons near it, wherever you are." />
      ) : null}

      {!places.isPending && !(places.isError && !places.data) && (
        <Card className="flex flex-col gap-2">
          {full ? (
            <p className="text-sm text-muted">You've saved {MAX_PLACES} places, the most there can be. Change or delete one to add another.</p>
          ) : (
            <Link to="/places/new" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink">
              Add an address
            </Link>
          )}
        </Card>
      )}
    </Page>
  )
}
