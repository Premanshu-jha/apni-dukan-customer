import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import {
  chosenOf,
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
import { permissionState, useLocation } from '../../store/location'
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
  if (places.isPending) return <Page back="/places" title={id ? 'Change place' : 'Add an address'}><Loading /></Page>
  if (places.isError && !places.data) {
    return (
      <Page back="/places" title={id ? 'Change place' : 'Add an address'}>
        <ErrorState message={messageOf(places.error)} onRetry={() => places.refetch()} />
      </Page>
    )
  }
  const existing = id ? places.data.find((p) => p.id === id) : undefined
  if (id && !existing) {
    return (
      <Page back="/places" title="Change place">
        <EmptyState title="That place isn't saved any more" body="It may have been deleted on another phone." />
      </Page>
    )
  }
  // A fresh form for each place (the key), filled from it once
  return <PlaceForm key={id ?? 'new'} existing={existing ?? null} all={places.data} />
}

/** A new place's kind: Home if there's none yet, then Work, then Other. */
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
  const chosen = useLocation((s) => s.chosen)
  const choose = useLocation((s) => s.choose)
  const [form, setForm] = useState<Form>(() =>
    existing
      ? { kind: existing.kind, name: existing.name ?? '', addressLine: existing.addressLine, area: existing.area, city: existing.city, pincode: existing.pincode }
      : { kind: firstFreeKind(all), name: '', addressLine: '', area: '', city: '', pincode: '' },
  )
  const [pin, setPin] = useState<Pin | null>(() =>
    existing ? { lat: existing.latitude, lng: existing.longitude, gps: null, zoom: 18, placement: 0 } : null,
  )
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
        // The button that was tapped is gone: on to the way that is left
        requestAnimationFrame(() => document.getElementById('use-current-location')?.focus())
      } else setSearchError(failure.text)
    } finally {
      setSearching(false)
    }
  }

  async function save() {
    setTouched(true)
    setError(null)
    if (Object.keys(problems).length || !pin || !insideIndia(pin.lat, pin.lng) || takenBy(form.kind)) return
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
    setBusy(true)
    try {
      const saved = existing ? await placesApi.update(existing.id, body) : await placesApi.add(body)
      qc.setQueryData<SavedPlace[]>(placeKeys.all, (old) =>
        old ? (existing ? old.map((p) => (p.id === saved.id ? saved : p)) : [...old, saved]) : old,
      )
      void refreshPlaces(qc)
      if (!existing) {
        // A new place is where the customer wants salons now
        choose(chosenOf(saved))
        navigate('/', { replace: true })
      } else {
        if (chosen?.id === saved.id) choose(chosenOf(saved))
        navigate('/places', { replace: true })
      }
    } catch (e) {
      setError(e)
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
      navigate('/places', { replace: true })
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
    <Page back="/places" title={existing ? `Change ${placeLabel(existing)}` : 'Add an address'}>
      <Card className="flex flex-col gap-3">
        <p className="font-medium" id="kind-label">Save as</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="kind-label">
          {KINDS.map(({ kind, label }) => (
            <Chip key={kind} selected={form.kind === kind} onClick={() => { setForm((f) => ({ ...f, kind })); setError(null) }}>
              {label}
            </Chip>
          ))}
        </div>
        {taken && (
          <p className="text-sm text-warn">
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
          <p className="font-semibold">On the map</p>
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
          {filled && <Banner tone="info">{FILLED_TEXT}</Banner>}
          {searchError && <Banner tone="warn">{searchError}</Banner>}
          {found && <Banner tone={found === 'EXACT' ? 'info' : 'warn'}>{precisionHint(found)}</Banner>}
          {addressChanged && <Banner tone="info">You changed the address. Tap Find on map again, or drag the pin.</Banner>}
          {locError === 'timeout' && <Banner tone="warn">That took too long. Turn on GPS and move near a window, then try again.</Banner>}
          {locError === 'unavailable' && <Banner tone="warn">Your phone couldn't find its location. Check that location is on.</Banner>}
          {locError === 'unsupported' && <Banner tone="warn">This browser can't share a location. Find the address on the map instead.</Banner>}
        </div>
        {pin && (
          <>
            <Suspense fallback={<Loading label="Loading the map…" />}>
              <PinMap lat={pin.lat} lng={pin.lng} zoom={pin.zoom} placement={pin.placement} onMove={moveByHand} />
            </Suspense>
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

      {generalError && <Banner tone="bad">{generalError}</Banner>}
      <Button busy={busy} disabled={askDelete} onClick={save}>
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
