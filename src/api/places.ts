import { useQuery, type QueryClient } from '@tanstack/react-query'
import { addressSearchOff, markAddressSearchOff } from '../lib/addressPin'
import { storage } from '../lib/storage'
import { NEAR_ADDRESS_KEY } from '../store/location'
import { useSession } from '../store/session'
import { api } from './client'
import { isApiError } from './errors'

/** Home and Work: one each. Other: any number, each with a name of its own. */
export type PlaceKind = 'HOME' | 'WORK' | 'OTHER'

/** A saved place (GET /me/places). name is null for Home and Work. */
export interface SavedPlace {
  id: string
  kind: PlaceKind
  name: string | null
  addressLine: string
  area: string
  city: string
  pincode: string
  latitude: number
  longitude: number
  updatedAt: string
}

/** What is saved: the whole place each time. */
export interface PlaceIn {
  kind: PlaceKind
  name?: string
  addressLine: string
  area: string
  city: string
  pincode: string
  latitude: number
  longitude: number
}

/** The typed address "Find on map" sends. */
export interface AddressIn {
  addressLine: string
  area: string
  city: string
  pincode: string
}

export type Precision = 'EXACT' | 'STREET' | 'AREA'

/** Where a typed address is: the pin to start from, and how close it is. */
export interface Located {
  latitude: number
  longitude: number
  precision: Precision
  formattedAddress: string
}

/** The address at a GPS point, in the form's fields ("" where nothing was found). */
export interface Described {
  addressLine: string
  area: string
  city: string
  pincode: string
  formattedAddress: string
}

/** How many places one person can save (PlaceService.MAX_PLACES). */
export const MAX_PLACES = 10

const P = '/api/v1/me/places'

export const placeKeys = { all: ['places'] as const }

export const placesApi = {
  list: () => api<SavedPlace[]>('GET', P),
  add: (p: PlaceIn) => api<SavedPlace>('POST', P, { body: p }),
  update: (id: string, p: PlaceIn) => api<SavedPlace>('PUT', `${P}/${encodeURIComponent(id)}`, { body: p }),
  remove: (id: string) => api<void>('DELETE', `${P}/${encodeURIComponent(id)}`),
  geocode: (a: AddressIn) => api<Located>('POST', `${P}/geocode`, { body: a }),
  reverseGeocode: (latitude: number, longitude: number) =>
    api<Described>('POST', `${P}/reverse-geocode`, { body: { latitude, longitude } }),
}

/** My saved places: Home, Work, then the others. */
export function usePlaces() {
  return useQuery({ queryKey: placeKeys.all, queryFn: placesApi.list })
}

/** After a save or delete: read the list again (another phone may have changed it too). */
export function refreshPlaces(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: placeKeys.all })
}

/** "Home", "Work", or the place's own name. */
export function placeLabel(p: Pick<SavedPlace, 'kind' | 'name'>): string {
  return p.kind === 'HOME' ? 'Home' : p.kind === 'WORK' ? 'Work' : (p.name ?? 'Saved place')
}

/** "Flat 4B, Kondapur": enough to tell places apart. */
export function placeShort(p: Pick<SavedPlace, 'addressLine' | 'area'>): string {
  return `${p.addressLine}, ${p.area}`
}

/** What the app keeps of a saved place picked to find salons near (store/location ChosenPlace). */
export function chosenOf(p: SavedPlace) {
  return { id: p.id, label: placeLabel(p), short: placeShort(p), lat: p.latitude, lng: p.longitude }
}

/** "Lake View Apartments, Kondapur" from the address at a point: enough to recognise it; null when there is nothing. */
export function nearText(d: Pick<Described, 'addressLine' | 'area' | 'city' | 'formattedAddress'>): string | null {
  const parts = [d.addressLine, d.area].map((p) => p.trim()).filter(Boolean)
  if (parts.length === 2) return parts.join(', ')
  const short = [parts[0], d.city.trim()].filter(Boolean)
  if (short.length) return short.join(', ')
  const all = d.formattedAddress.trim()
  return all ? all.split(',').slice(0, 2).join(',').trim() : null
}

/** Three decimals: about 110 m (the backend keeps answers per ~11 m, so nearby customers share them). */
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Within this of the last point looked up, its address is still the one shown: no new lookup. */
export const NEAR_REUSE_METRES = 300
/** At most this many lookups a day from Home, so the person's own 10 a day stay for setting their places. */
export const NEAR_LOOKUPS_PER_DAY = 3

/** What the phone keeps (NEAR_ADDRESS_KEY): the last point looked up, its words (null: none there), today's count. */
interface KeptNear {
  lat: number
  lng: number
  text: string | null
  day: string
  count: number
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The address near the phone's GPS point, for "Near your current location" on Home, so the customer sees where that
 * is. Sparing with Google lookups (each person has 10 a day, customers 100 between them): within
 * {@link NEAR_REUSE_METRES} of the last point looked up its words are shown again, and Home looks up at most
 * {@link NEAR_LOOKUPS_PER_DAY} times a day. Kept on the phone, forgotten on sign-out. Quiet when it can't be had
 * (search off or used up, offline, nothing there): the bar shows without it.
 */
export function useAddressNear(lat: number, lng: number, enabled: boolean) {
  const at = { lat: round3(lat), lng: round3(lng) }
  return useQuery({
    queryKey: ['address-near', at.lat, at.lng],
    enabled: enabled && !addressSearchOff(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string | null> => {
      const kept = storage.getJson<KeptNear>(NEAR_ADDRESS_KEY)
      if (kept && metres(kept, at) < NEAR_REUSE_METRES) return kept.text
      const count = kept && kept.day === today() ? kept.count : 0
      if (count >= NEAR_LOOKUPS_PER_DAY) return null
      const who = useSession.getState().user?.id
      // Counted with the answer; "nothing there" counts too (it used a Google lookup), being offline doesn't
      const keep = (text: string | null) => {
        // Signed out (or someone else signed in) while this was on its way: keep nothing for the next person
        if (useSession.getState().user?.id !== who) return
        storage.setJson(NEAR_ADDRESS_KEY, { ...at, text, day: today(), count: count + 1 } satisfies KeptNear)
      }
      try {
        const text = nearText(await placesApi.reverseGeocode(at.lat, at.lng))
        keep(text)
        return text
      } catch (e) {
        if (isApiError(e, 'GEOCODING_OFF')) markAddressSearchOff()
        else if (isApiError(e, 'ADDRESS_NOT_FOUND')) keep(null)
        return null
      }
    },
  })
}
