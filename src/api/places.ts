import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from './client'

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
