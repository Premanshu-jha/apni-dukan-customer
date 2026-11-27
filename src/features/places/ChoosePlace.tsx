import { Link, useNavigate } from 'react-router'
import { chosenOf, MAX_PLACES, placeLabel, placeShort, usePlaces, type SavedPlace } from '../../api/places'
import { messageOf } from '../../api/errors'
import { Card, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { goBack, screensBehind } from '../../lib/nav'
import { useLocation } from '../../store/location'
import { useT } from '../../i18n'

const ICON: Record<SavedPlace['kind'], string> = { HOME: '⌂', WORK: '▣', OTHER: '◉' }

/**
 * Where to find salons: the phone's current location, or one of the saved places (Home, Work, others), like the
 * address list of a delivery app. Picking one goes back to the salons. Each saved place can be changed from here, and
 * new ones added (up to 10).
 */
export function ChoosePlace() {
  const t = useT()
  const navigate = useNavigate()
  const places = usePlaces()
  const chosen = useLocation((s) => s.chosen)
  const switchTo = useLocation((s) => s.switchTo)
  const pick = (p: SavedPlace | null) => {
    switchTo(p ? chosenOf(p) : null)
    goBack(navigate, '/')
  }
  const list = places.data ?? []
  const full = list.length >= MAX_PLACES
  return (
    <Page back={screensBehind() > 0 ? true : '/'} title={t('places.chooseTitle')}>
      <ul className="flex flex-col gap-2" aria-label={t('places.placesLabel')}>
        <li>
          <button
            type="button"
            onClick={() => pick(null)}
            aria-current={chosen === null ? 'true' : undefined}
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left ${chosen === null ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
          >
            <span aria-hidden className="text-xl">⌖</span>
            <span className="flex-1">
              <span className="block font-semibold">{t('places.currentLocation')}</span>
              <span className="block text-sm text-muted">{t('places.fromGps')}</span>
            </span>
            {chosen === null && <span className="text-sm text-link">{t('places.selected')}</span>}
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
                {on && <span className="text-sm text-link">{t('places.selected')}</span>}
              </button>
              <Link to={`/places/${p.id}`} className="flex items-center px-4 text-sm text-link" aria-label={t('places.changePlaceLabel', { place: placeLabel(p) })}>
                {t('common.change')}
              </Link>
            </li>
          )
        })}
      </ul>

      {places.isPending ? (
        <Loading label={t('places.loadingPlaces')} />
      ) : places.isError && !places.data ? (
        <ErrorState message={messageOf(places.error)} onRetry={() => places.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title={t('places.noPlacesTitle')} body={t('places.noPlacesBody')} />
      ) : null}

      {!places.isPending && !(places.isError && !places.data) && (
        <Card className="flex flex-col gap-2">
          {full ? (
            <p className="text-sm text-muted">{t('places.placesFull', { max: MAX_PLACES })}</p>
          ) : (
            <Link to="/places/new" state={{ from: 'places' }} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink">
              {t('places.addAddress')}
            </Link>
          )}
        </Card>
      )}
    </Page>
  )
}
