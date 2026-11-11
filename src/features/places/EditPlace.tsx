import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation as useRouterLocation, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import {
  chosenOf,
  MAX_PLACES,
  placeKeys,
  placeLabel,
  placesApi,
  refreshPlaces,
  usePlaces,
  type PlaceIn,
  type PlaceKind,
  type Precision,
  type SavedPlace,
} from '../../api/places'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Page } from '../../components/ui'
import {
  ADDRESS_FIELDS,
  addressProblems,
  addressSearchOff,
  canSearchAddress,
  FILLED_TEXT,
  fillEmpty,
  insideIndia,
  locateOnce,
  markAddressSearchOff,
  metresBetween,
  precisionHint,
  ROUGH_PIN_METRES,
  round6,
  searchFailure,
  zoomFor,
  type Fix,
  type LocateError,
} from '../../lib/addressPin'
import { goBack, screensBehind } from '../../lib/nav'
import { forgetPlaceDraft, PLACE_DRAFT_KEY, permissionState, useLocation } from '../../store/location'
import { LocationGuide } from '../location/LocationGate'

const PinMap = lazy(() => import('../../components/PinMap').then((m) => ({ default: m.PinMap })))

interface Form {
  kind: PlaceKind
  name: string
  addressLine: string
  area: string
  city: string
  pincode: string
}

/** The pin: where it is, the GPS fix it came from (if it did), how close the map starts, and each placing. */
interface Pin {
  lat: number
  lng: number
  gps: Fix | null
  zoom: number
  placement: number
}

const KINDS: { kind: PlaceKind; label: string }[] = [
  { kind: 'HOME', label: 'Home' },
  { kind: 'WORK', label: 'Work' },
  { kind: 'OTHER', label: 'Other' },
]

/** /places/new, or /places/:id to change one. */
export function EditPlace() {
  const { id } = useParams()
  const places = usePlaces()
  // The place as it was when the form opened: deleted on another phone meanwhile, the form stays (Save then offers
  // to save it as a new place) instead of vanishing with what was typed
  const [opened, setOpened] = useState<SavedPlace | undefined>(undefined)
  const found = id ? places.data?.find((p) => p.id === id) : undefined
  if (found && opened?.id !== found.id) setOpened(found)
  const back = screensBehind() > 0 ? true : '/places'
  const title = id ? 'Change place' : 'Add an address'
  if (places.isPending) return <Page back={back} title={title}><Loading /></Page>
  if (places.isError && !places.data) {
    return (
      <Page back={back} title={title}>
        <ErrorState message={messageOf(places.error)} onRetry={() => places.refetch()} />
      </Page>
    )
  }
  const existing = found ?? (opened?.id === id ? opened : undefined)
  if (id && !existing) {
    return (
      <Page back={back} title="Change place">
        <EmptyState title="That place isn't saved any more" body="It may have been deleted on another phone." />
      </Page>
    )
  }
  if (!id && places.data.length >= MAX_PLACES) {
    return (
      <Page back={back} title={title}>
        <EmptyState title={`You've saved ${MAX_PLACES} places`} body="That's the most there can be. Change or delete one to add another." />
      </Page>
    )
  }
  // A fresh form for each place (the key), filled from it once
  return <PlaceForm key={id ?? 'new'} existing={existing ?? null} all={places.data} />
}

/** The map couldn't be loaded (offline, or a new version of the app meanwhile): the form stays usable. */
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? (
      <Banner tone="warn">
        The map couldn't load. Your pin is kept and can be saved; to move it on the map, check your connection and open
        this page again.
      </Banner>
    ) : (
      this.props.children
    )
  }
}

/** A new place's form as typed, kept in this tab (a reload doesn't lose it); forgotten on save and on sign-out. */
interface Draft {
  form: Form
  pin: Pin | null
}

function readDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(PLACE_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

/** A new place's kind: Home if there's none yet, then Work, then Other. */
/** The place in the list is the one being saved (its first answer was lost). */
function sameAs(p: SavedPlace, b: PlaceIn): boolean {
  const tidy = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim()
  return (
    p.kind === b.kind &&
    tidy(p.name) === tidy(b.name) &&
    tidy(p.addressLine) === tidy(b.addressLine) &&
    tidy(p.area) === tidy(b.area) &&
    tidy(p.city) === tidy(b.city) &&
    p.pincode === b.pincode &&
    Math.abs(p.latitude - b.latitude) < 1e-6 &&
    Math.abs(p.longitude - b.longitude) < 1e-6
  )
}

function firstFreeKind(all: SavedPlace[]): PlaceKind {
  if (!all.some((p) => p.kind === 'HOME')) return 'HOME'
  if (!all.some((p) => p.kind === 'WORK')) return 'WORK'
  return 'OTHER'
}

/**
 * The address and the pin, set like a salon's address at registration: "Use current location" puts the pin at the
 * phone's GPS point and fills the empty fields from the address there; "Find on map" puts it at the typed address.
 * Either way the customer drags it where it belongs (or taps the map). The last thing done wins: a slow answer to an
 * older tap never moves the pin or undoes a drag.
 */
function PlaceForm({ existing, all }: { existing: SavedPlace | null; all: SavedPlace[] }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const from = (useRouterLocation().state as { from?: string } | null)?.from
  const chosen = useLocation((s) => s.chosen)
  const choose = useLocation((s) => s.choose)
  const [draft] = useState(() => (existing ? null : readDraft()))
  const [form, setForm] = useState<Form>(() =>
    existing
      ? { kind: existing.kind, name: existing.name ?? '', addressLine: existing.addressLine, area: existing.area, city: existing.city, pincode: existing.pincode }
      : (draft?.form ?? { kind: firstFreeKind(all), name: '', addressLine: '', area: '', city: '', pincode: '' }),
  )
  const [pin, setPin] = useState<Pin | null>(() =>
    existing ? { lat: existing.latitude, lng: existing.longitude, gps: null, zoom: 18, placement: 0 } : (draft?.pin ?? null),
  )
  /** Saving a change found the place deleted on another phone: offer to save it as a new one. */
  const [gone, setGone] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<LocateError | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchHidden, setSearchHidden] = useState(addressSearchOff)
  /** How exact the pin from the address is; null once GPS, a drag or a later edit took over. */
  const [found, setFound] = useState<Precision | null>(null)
  const [addressChanged, setAddressChanged] = useState(false)
  const [needFields, setNeedFields] = useState(false)
  const [filled, setFilled] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [askDelete, setAskDelete] = useState(false)
  const latest = useRef(0)
  const formNow = useRef(form)
  useEffect(() => {
    formNow.current = form
  }, [form])

  useEffect(() => {
    void permissionState().then((s) => setBlocked(s === 'denied'))
  }, [locError])

  // A new place: what is typed survives a reload of this tab
  useEffect(() => {
    if (existing) return
    try {
      window.sessionStorage.setItem(PLACE_DRAFT_KEY, JSON.stringify({ form, pin } satisfies Draft))
    } catch {
      /* storage blocked: the form lives only on screen */
    }
  }, [existing, form, pin])

  // Home and Work are one each: taken by another of this person's places
  const takenBy = (k: PlaceKind) => (k === 'OTHER' ? undefined : all.find((p) => p.kind === k && p.id !== existing?.id))
  const problems: Partial<Record<keyof Form, string>> = { ...addressProblems(form) }
  if (form.kind === 'OTHER' && form.name.trim().length < 2) problems.name = 'Give this place a name, e.g. Gym.'
  const show = (k: keyof Form) => (touched ? problems[k] : undefined) ?? fieldError(error, k)

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [k]: value }))
    setError(null)
    if ((ADDRESS_FIELDS as readonly string[]).includes(k)) {
      setNeedFields(false)
      setSearchError(null)
      if (found) {
        setFound(null)
        setAddressChanged(true)
      }
    }
  }

  function place(lat: number, lng: number, gps: Fix | null, zoom: number) {
    setPin((p) => ({ lat, lng, gps, zoom, placement: (p?.placement ?? 0) + 1 }))
  }

  function moveByHand(lat: number, lng: number) {
    latest.current++
    setPin((p) => (p ? { ...p, lat, lng } : p))
    setFound(null)
    setAddressChanged(false)
  }

  async function locate() {
    const tap = ++latest.current
    setLocating(true)
    setLocError(null)
    try {
      const fix = await locateOnce()
      if (tap !== latest.current) return
      place(fix.lat, fix.lng, fix, 18)
      setFound(null)
      setSearchError(null)
      setAddressChanged(false)
      setFilled(false)
      // Only worth asking while an address field is still empty
      if (ADDRESS_FIELDS.some((k) => !formNow.current[k].trim())) void fillFromPoint(fix, tap)
    } catch (e) {
      if (tap === latest.current) setLocError(e as LocateError)
    } finally {
      setLocating(false)
    }
  }

  /** The address at the GPS point fills the empty fields; quiet when it fails (the customer can still type). */
  async function fillFromPoint(fix: Fix, tap: number) {
    if (addressSearchOff()) return
    try {
      const at = await placesApi.reverseGeocode(round6(fix.lat), round6(fix.lng))
      if (tap !== latest.current) return
      if (fillEmpty(formNow.current, at) === formNow.current) return
      setForm((f) => fillEmpty(f, at))
      setFilled(true)
    } catch (e) {
      if (isApiError(e, 'GEOCODING_OFF')) {
        markAddressSearchOff()
        setSearchHidden(true)
      }
    }
  }

  async function searchAddress() {
    if (!canSearchAddress(form)) {
      setNeedFields(true)
      return
    }
    const tap = ++latest.current
    setSearching(true)
    setSearchError(null)
    setNeedFields(false)
    setFilled(false)
    const sent = { addressLine: form.addressLine.trim(), area: form.area.trim(), city: form.city.trim(), pincode: form.pincode.trim() }
    try {
      const at = await placesApi.geocode(sent)
      if (tap !== latest.current) return
      place(at.latitude, at.longitude, null, zoomFor(at.precision))
      const edited = ADDRESS_FIELDS.some((k) => formNow.current[k].trim() !== sent[k])
      setFound(edited ? null : at.precision)
      setAddressChanged(edited)
      setLocError(null)
    } catch (e) {
      if (tap !== latest.current) return
      const failure = searchFailure(e)
      setFound(null)
      setAddressChanged(false)
      if (failure.hide) {
        setSearchHidden(true)
        // The button that was tapped is gone: on to the way that is left (or the card's heading when the steps to turn
        // location on show instead)
        requestAnimationFrame(() => (document.getElementById('use-current-location') ?? document.getElementById('place-map'))?.focus())
      } else setSearchError(failure.text)
    } finally {
      setSearching(false)
    }
  }

  /** Save tapped with something to put right: focus goes to the first thing, so it is seen (and heard). */
  function focusFirstProblem() {
    const order: [boolean, string][] = [
      [takenBy(form.kind) !== undefined, 'kind-label'],
      [!!problems.name, 'place-name'],
      [!!problems.addressLine, 'address'],
      [!!problems.area, 'area'],
      [!!problems.city, 'city'],
      [!!problems.pincode, 'pincode'],
      [!pin || !insideIndia(pin.lat, pin.lng), 'place-map'],
    ]
    const first = order.find(([bad]) => bad)
    if (first) requestAnimationFrame(() => document.getElementById(first[1])?.focus())
  }

  /** A new place saved: it is picked, and the customer goes back to where the list was opened from (or Home). */
  function savedNew(saved: SavedPlace) {
    forgetPlaceDraft()
    choose(chosenOf(saved))
    if (from === 'places' && screensBehind() >= 2) goBack(navigate, '/', 2)
    else navigate('/', { replace: true })
  }

  async function save(asNew = false) {
    setTouched(true)
    setError(null)
    if (Object.keys(problems).length || !pin || !insideIndia(pin.lat, pin.lng) || takenBy(form.kind)) {
      focusFirstProblem()
      return
    }
    const body: PlaceIn = {
      kind: form.kind,
      ...(form.kind === 'OTHER' ? { name: form.name.trim() } : {}),
      addressLine: form.addressLine.trim(),
      area: form.area.trim(),
      city: form.city.trim(),
      pincode: form.pincode.trim(),
      latitude: round6(pin.lat),
      longitude: round6(pin.lng),
    }
    const adding = !existing || asNew
    setBusy(true)
    try {
      const saved = adding ? await placesApi.add(body) : await placesApi.update(existing.id, body)
      qc.setQueryData<SavedPlace[]>(placeKeys.all, (old) =>
        old ? (adding ? [...old, saved] : old.map((p) => (p.id === saved.id ? saved : p))) : old,
      )
      void refreshPlaces(qc)
      if (adding) {
        if (existing && chosen?.id === existing.id) choose(null)
        savedNew(saved)
      } else {
        if (chosen?.id === saved.id) choose(chosenOf(saved))
        goBack(navigate, '/places')
      }
    } catch (e) {
      // The first tap's answer was lost but it was saved: the same place is in the list now, so it is done
      if (adding && isApiError(e) && (e.status === 0 || isApiError(e, 'PLACE_KIND_TAKEN'))) {
        const list = await qc.fetchQuery({ queryKey: placeKeys.all, queryFn: placesApi.list, staleTime: 0 }).catch(() => null)
        const same = list?.find((p) => sameAs(p, body) && (!existing || p.id !== existing.id))
        if (same) {
          savedNew(same)
          return
        }
      }
      setError(e)
      if (isApiError(e, 'PLACE_NOT_FOUND')) setGone(true)
      // Changed or deleted on another phone meanwhile, or a Home saved there: read the list again
      if (isApiError(e, 'PLACE_NOT_FOUND') || isApiError(e, 'PLACE_KIND_TAKEN') || isApiError(e, 'TOO_MANY_PLACES')) {
        void refreshPlaces(qc)
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing) return
    setBusy(true)
    setError(null)
    try {
      await placesApi.remove(existing.id)
      if (chosen?.id === existing.id) choose(null)
      qc.setQueryData<SavedPlace[]>(placeKeys.all, (old) => old?.filter((p) => p.id !== existing.id))
      void refreshPlaces(qc)
      goBack(navigate, '/places')
    } catch (e) {
      setError(e)
      setAskDelete(false)
    } finally {
      setBusy(false)
    }
  }

  const moved = pin?.gps ? metresBetween(pin.gps, pin) : 0
  const fieldKeys: (keyof Form)[] = ['name', 'addressLine', 'area', 'city', 'pincode']
  const generalError = error && !fieldKeys.some((k) => fieldError(error, k)) ? messageOf(error) : null
  const taken = takenBy(form.kind)

  return (
    <Page back={screensBehind() > 0 ? true : '/places'} title={existing ? `Change ${placeLabel(existing)}` : 'Add an address'}>
      <Card className="flex flex-col gap-3">
        <p className="font-medium outline-none" id="kind-label" tabIndex={-1}>
          Save as
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="kind-label">
          {KINDS.map(({ kind, label }) => (
            <Chip key={kind} selected={form.kind === kind} onClick={() => { setForm((f) => ({ ...f, kind })); setError(null) }}>
              {label}
            </Chip>
          ))}
        </div>
        {taken && (
          <p className="text-sm text-warn" role="status">
            You already have a {form.kind === 'HOME' ? 'Home' : 'Work'} address ({taken.addressLine}). Change that one, or
            save this as Other.
          </p>
        )}
        {form.kind === 'OTHER' && (
          <Field id="place-name" label="Name" placeholder="e.g. Gym, Mom's place" value={form.name} onChange={set('name')} maxLength={30} error={show('name')} />
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <Field id="address" label="House or flat number, building, street" value={form.addressLine} onChange={set('addressLine')} maxLength={200} autoComplete="address-line1" error={show('addressLine')} />
        <Field id="area" label="Area" value={form.area} onChange={set('area')} maxLength={100} error={show('area')} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="city" label="City" value={form.city} onChange={set('city')} maxLength={60} autoComplete="address-level2" error={show('city')} />
          <Field id="pincode" label="Pincode" inputMode="numeric" value={form.pincode} onChange={set('pincode')} maxLength={6} autoComplete="postal-code" error={show('pincode')} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <p id="place-map" tabIndex={-1} className="font-semibold outline-none">
            On the map
          </p>
          <p className="text-sm text-muted">
            {searchHidden
              ? 'Tap Use current location when you are there, then drag the pin onto your building.'
              : 'Use your current location, or find the address on the map. Then drag the pin onto your building.'}{' '}
            Salons are found around this pin; they never see your address.
          </p>
        </div>
        {!searchHidden && (
          <Button
            variant="secondary"
            busy={searching}
            disabled={locating}
            aria-disabled={!canSearchAddress(form) || undefined}
            className={canSearchAddress(form) ? '' : 'opacity-50'}
            onClick={searchAddress}
            aria-describedby={needFields ? 'address-search-needs' : undefined}
          >
            Find on map
          </Button>
        )}
        <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
          {needFields && (
            <p id="address-search-needs" className="text-sm text-muted">
              Fill in the address, area, city and pincode above to find it on the map.
            </p>
          )}
          {filled && <Banner tone="info" live={false}>{FILLED_TEXT}</Banner>}
          {searchError && <Banner tone="warn" live={false}>{searchError}</Banner>}
          {found && <Banner tone={found === 'EXACT' ? 'info' : 'warn'} live={false}>{precisionHint(found)}</Banner>}
          {addressChanged && <Banner tone="info" live={false}>You changed the address. Tap Find on map again, or drag the pin.</Banner>}
          {locError === 'timeout' && <Banner tone="warn" live={false}>That took too long. Turn on GPS and move near a window, then try again.</Banner>}
          {locError === 'unavailable' && <Banner tone="warn" live={false}>Your phone couldn't find its location. Check that location is on.</Banner>}
          {locError === 'unsupported' && <Banner tone="warn" live={false}>This browser can't share a location. Find the address on the map instead.</Banner>}
        </div>
        {pin && (
          <>
            <MapBoundary>
              <Suspense fallback={<Loading label="Loading the map…" />}>
                <PinMap lat={pin.lat} lng={pin.lng} zoom={pin.zoom} placement={pin.placement} onMove={moveByHand} />
              </Suspense>
            </MapBoundary>
            <p className="text-sm text-muted">
              Drag the pin, or tap the map, if it's off.
              {pin.gps && ` GPS was accurate to about ${pin.gps.accuracy} m.`}
              {moved > 0 && ` Moved ${moved} m from the GPS point.`}
            </p>
            {pin.gps && pin.gps.accuracy > ROUGH_PIN_METRES && (
              <Banner tone="warn">The phone isn't sure where it is. Drag the pin onto your building, or try again near a window.</Banner>
            )}
            {!insideIndia(pin.lat, pin.lng) && <Banner tone="bad">The pin must be in India.</Banner>}
          </>
        )}
        {(locError === 'denied' || (!pin && blocked)) && searchHidden ? (
          // No address search either: the only way is to turn location on
          <LocationGuide onRetry={locate} />
        ) : locError === 'denied' || (!pin && blocked) ? (
          <>
            <Banner tone="warn">Location is blocked for this site. Find the address on the map instead, or allow location in your browser.</Banner>
            <Button id="use-current-location" variant="secondary" disabled={searching} onClick={locate}>
              Try my location again
            </Button>
          </>
        ) : (
          <Button id="use-current-location" variant={pin ? 'secondary' : 'primary'} busy={locating} disabled={searching} onClick={locate}>
            {pin?.gps ? 'Take my location again' : 'Use current location'}
          </Button>
        )}
        {touched && !pin && <p className="text-sm text-bad">Put the pin on the map: use your current location or find the address.</p>}
      </Card>

      {gone ? (
        <Banner tone="bad">
          This place was deleted on another phone.{' '}
          <button type="button" className="underline" disabled={busy} onClick={() => save(true)}>
            Save it as a new place
          </button>
        </Banner>
      ) : (
        generalError && <Banner tone="bad">{generalError}</Banner>
      )}
      <Button busy={busy} disabled={askDelete} onClick={() => save()}>
        {existing ? 'Save changes' : 'Save address'}
      </Button>
      {existing &&
        (askDelete ? (
          <Card className="flex flex-col gap-2">
            <p className="text-sm">Delete {placeLabel(existing)}? You can add it again any time.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" busy={busy} onClick={remove}>
                Yes, delete
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setAskDelete(false)}>
                Keep it
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="ghost" className="text-bad" disabled={busy} onClick={() => setAskDelete(true)}>
            Delete this place
          </Button>
        ))}
    </Page>
  )
}
