import { Link } from 'react-router'
import { chosenOf, MAX_PLACES, placeLabel, usePlaces, type SavedPlace } from '../../api/places'
import { useEffect } from 'react'
import { storage } from '../../lib/storage'
import { HAS_PLACES_KEY, useLocation } from '../../store/location'
import { useT } from '../../i18n'

const ICON: Record<SavedPlace['kind'], string> = { HOME: '⌂', WORK: '▣', OTHER: '◉' }

const chip = (on: boolean) =>
  `inline-flex min-h-11 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${
    on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-ink hover:bg-raised'
  }`

/**
 * On Home, always in sight: one chip per place to find salons near (the current location, then Home, Work and the
 * others as saved), the picked one filled in, and "＋ Add place". One tap switches; no list to open first. Uses Home's
 * own list of places (the same query, no extra request); shown once the list is read and holds a place (before that
 * there is nothing to switch between, and a new customer's first screen keeps the salons in sight), so chips never jump in late
 * under the customer's thumb. Without the list (offline, an error) the bar's "Change" still opens the full list.
 */
export function PlaceChips() {
  const t = useT()
  const places = usePlaces()
  const chosen = useLocation((s) => s.chosen)
  const switchTo = useLocation((s) => s.switchTo)
  const has = places.isSuccess ? places.data.length > 0 : null
  useEffect(() => {
    if (has === true) storage.set(HAS_PLACES_KEY, '1')
    else if (has === false) storage.remove(HAS_PLACES_KEY)
  }, [has])
  // Still loading, for someone who had places (or has one picked): the row's room is kept, so nothing jumps
  if (places.isPending) {
    return chosen !== null || storage.get(HAS_PLACES_KEY) === '1' ? <div aria-hidden className="h-12" /> : null
  }
  if (!places.isSuccess) return null
  // Nothing saved yet: nothing to switch between (the bar's Change and "Save as Home?" lead to the first place)
  if (places.data.length === 0) return null
  const list = places.data
  const noHome = !list.some((p) => p.kind === 'HOME')
  return (
    <div role="group" aria-label={t('home.chipsLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <button type="button" aria-pressed={chosen === null} onClick={() => chosen !== null && switchTo(null)} className={chip(chosen === null)}>
        <span aria-hidden>⌖</span>
        <span className="truncate">{t('home.chipCurrent')}</span>
      </button>
      {list.map((p) => {
        const on = chosen?.id === p.id
        return (
          <button key={p.id} type="button" aria-pressed={on} onClick={() => !on && switchTo(chosenOf(p))} className={chip(on)}>
            <span aria-hidden>{ICON[p.kind]}</span>
            <span className="truncate">{placeLabel(p)}</span>
          </button>
        )
      })}
      {list.length < MAX_PLACES && (
        <Link
          to="/places/new"
          state={noHome ? { kind: 'HOME' } : undefined}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-dashed border-brand px-3.5 text-sm font-semibold text-link hover:bg-raised"
        >
          <span aria-hidden>＋</span>
          {noHome ? t('home.chipAddHome') : t('home.chipAdd')}
        </Link>
      )}
    </div>
  )
}
