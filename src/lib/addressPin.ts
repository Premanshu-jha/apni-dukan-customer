import { ApiError } from '../api/errors'
import { language, t } from '../i18n'
import { timeIst } from './ist'
import type { AddressIn, Described, Precision } from '../api/places'

/**
 * Setting a saved place, the same two ways as a salon's address at registration in the partner app: "Use current
 * location" puts the pin at the phone's GPS point and fills the empty address fields from it; "Find on map" turns
 * the typed address into a pin. Either way the customer then drags the pin where it belongs.
 */

/** A GPS position. accuracy in metres, as the phone reported it. */
export interface Fix {
  lat: number
  lng: number
  accuracy: number
}

export type LocateError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

/** Worse than this and the pin is probably off (a laptop guessing from its internet connection). */
export const ROUGH_PIN_METRES = 150

/** The phone's GPS position, once, with high accuracy. */
export function locateOnce(): Promise<Fix> {
  return new Promise((resolve, reject: (e: LocateError) => void) => {
    if (!('geolocation' in navigator)) {
      reject('unsupported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => reject(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  })
}

/** The backend takes India only: latitude 6–37.6, longitude 68–97.5. */
export function insideIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5
}

/** Six decimals (about 10 cm) is all the backend keeps. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Metres between two points (haversine), to say how far the pin was moved from the GPS point. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * r * Math.asin(Math.sqrt(h)))
}

/** The address fields; editing one after a search makes its pin out of date. */
export const ADDRESS_FIELDS = ['addressLine', 'area', 'city', 'pincode'] as const

/** How close the map starts: the building, the street, or the whole area. GPS points use 18. */
export function zoomFor(p: Precision): number {
  return p === 'EXACT' ? 18 : p === 'STREET' ? 17 : 15
}

/** The address as the backend checks it (PlaceRequests): each field filled, a 6-digit pincode. */
export function addressProblems(f: AddressIn): Partial<Record<keyof AddressIn, string>> {
  const out: Partial<Record<keyof AddressIn, string>> = {}
  const len = (v: string, min: number, max: number) => v.trim().length >= min && v.trim().length <= max
  if (!len(f.addressLine, 2, 200)) out.addressLine = t('misc.addressLineProblem')
  if (!len(f.area, 2, 100)) out.area = t('misc.addressAreaProblem')
  if (!len(f.city, 2, 60)) out.city = t('misc.addressCityProblem')
  if (!/^[1-9]\d{5}$/.test(f.pincode.trim())) out.pincode = t('misc.addressPincodeProblem')
  return out
}

/**
 * Filled well enough to search: the area, city and pincode (the house or flat line is not needed to find the street,
 * so someone who only wants salons near their area can find it on the map first; saving still needs it).
 */
export function canSearchAddress(f: AddressIn): boolean {
  const { addressLine: _house, ...rest } = addressProblems(f)
  return Object.keys(rest).length === 0
}

/** What "Find on map" sends: with no house or flat line yet, the area stands in for it (the search needs one). */
export function searchQuery(f: AddressIn): AddressIn {
  const q = { addressLine: f.addressLine.trim(), area: f.area.trim(), city: f.city.trim(), pincode: f.pincode.trim() }
  return q.addressLine.length >= 2 ? q : { ...q, addressLine: q.area }
}

/** What to tell the customer about a pin from the address. */
export function precisionHint(p: Precision): string {
  return p === 'EXACT' ? t('misc.pinCheckBuilding') : t('misc.pinOnlyClose')
}

/**
 * Turned off on the backend (no Google key): hide "Find on map" for the rest of this visit. Module-level, so a reload
 * asks again (the key may have been added meanwhile).
 */
let searchOff = false

export function addressSearchOff(): boolean {
  return searchOff
}

export function markAddressSearchOff(): void {
  searchOff = true
}

/** For tests only. */
export function resetAddressSearch(): void {
  searchOff = false
}

/**
 * When a wait of `seconds` from now ends, in India time: "11:15 PM", or "tomorrow, 9:00 AM" when it ends on another
 * day. The day's address searches run in a 24-hour window from the first one, not until midnight.
 */
export function waitEndsText(seconds: number, now: Date = new Date()): string {
  const end = new Date(now.getTime() + seconds * 1000)
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  // In another language: the app's own "4:30 PM" words (as everywhere else); English exactly as it always was
  const time = language() === 'en'
    ? end.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
    : timeIst(end.toISOString())
  return day(end) === day(now) ? time : t('misc.waitEndsTomorrow', { time })
}

/**
 * What a failed search says, kept as its key and values (not words): the screen words it when drawn, so it follows a
 * language change. A used-up day keeps when the searches come back ({@code until}, ms), not the time as words.
 */
export type SearchMessage =
  | { key: 'misc.searchNotFound' | 'misc.searchCheckAddress' | 'misc.searchBroken' }
  | { key: 'misc.searchTooMany'; count: number }
  | { key: 'misc.searchUsedUp'; until: number }

/** A failed search's words, in the app's language now. */
export function searchMessageText(m: SearchMessage, now: Date = new Date()): string {
  if (m.key === 'misc.searchTooMany') return t(m.key, { count: m.count })
  if (m.key === 'misc.searchUsedUp') {
    return t(m.key, { when: waitEndsText(Math.max(0, Math.round((m.until - now.getTime()) / 1000)), now) })
  }
  return t(m.key)
}

/** What a failed search means for the screen: hide the button, or what to say (worded with searchMessageText). */
export function searchFailure(e: unknown, now: Date = new Date()): { hide: true } | { hide: false; message: SearchMessage } {
  const code = e instanceof ApiError ? e.code : 'UNKNOWN'
  if (code === 'GEOCODING_OFF') {
    searchOff = true
    return { hide: true }
  }
  if (code === 'ADDRESS_NOT_FOUND') {
    return { hide: false, message: { key: 'misc.searchNotFound' } }
  }
  if (code === 'TRY_LATER' && e instanceof ApiError) {
    const minutes = Math.max(1, Math.ceil((e.retryAfterSeconds ?? 60) / 60))
    // The day's lookups (10 a person, in 24 hours from the first) are used up: say when they come back
    if (minutes > 60) {
      return { hide: false, message: { key: 'misc.searchUsedUp', until: now.getTime() + (e.retryAfterSeconds ?? 0) * 1000 } }
    }
    return { hide: false, message: { key: 'misc.searchTooMany', count: minutes } }
  }
  if (code === 'VALIDATION_FAILED') {
    return { hide: false, message: { key: 'misc.searchCheckAddress' } }
  }
  // GEOCODING_UNAVAILABLE, SERVICE_BUSY, offline, anything else
  return { hide: false, message: { key: 'misc.searchBroken' } }
}

/**
 * After "Use current location": the address at the GPS point fills only the fields still empty (never what the
 * customer typed, even while the answer was on its way). Returns the same object when nothing changes.
 */
export function fillEmpty<F extends AddressIn>(form: F, at: Described): F {
  let next = form
  for (const k of ADDRESS_FIELDS) {
    const value = (at[k] ?? '').trim()
    if (k === 'pincode' && !/^[1-9]\d{5}$/.test(value)) continue
    if (!form[k].trim() && value) next = { ...next, [k]: value }
  }
  return next
}

/** Said after "Use current location" filled the address (in the language on screen). */
export function filledText(): string {
  return t('misc.addressFilled')
}
