import { ApiError } from '../api/errors'
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
  if (!len(f.addressLine, 2, 200)) out.addressLine = 'Enter your house or flat number and street.'
  if (!len(f.area, 2, 100)) out.area = 'Enter the area.'
  if (!len(f.city, 2, 60)) out.city = 'Enter the city.'
  if (!/^[1-9]\d{5}$/.test(f.pincode.trim())) out.pincode = 'Enter the 6-digit pincode.'
  return out
}

/** All four filled well enough to search. */
export function canSearchAddress(f: AddressIn): boolean {
  return Object.keys(addressProblems(f)).length === 0
}

/** What to tell the customer about a pin from the address. */
export function precisionHint(p: Precision): string {
  return p === 'EXACT' ? 'Check the pin is on your building.' : 'This is only close by. Drag the pin onto your building.'
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
  const time = end.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
  return day(end) === day(now) ? time : `tomorrow, ${time}`
}

/** What a failed search means for the screen: hide the button, or the words to show. */
export function searchFailure(e: unknown): { hide: true } | { hide: false; text: string } {
  const code = e instanceof ApiError ? e.code : 'UNKNOWN'
  if (code === 'GEOCODING_OFF') {
    searchOff = true
    return { hide: true }
  }
  if (code === 'ADDRESS_NOT_FOUND') {
    return { hide: false, text: "Couldn't find that address. Check the pincode and area, or use your current location." }
  }
  if (code === 'TRY_LATER' && e instanceof ApiError) {
    const minutes = Math.max(1, Math.ceil((e.retryAfterSeconds ?? 60) / 60))
    // The day's lookups (10 a person, in 24 hours from the first) are used up: say when they come back
    if (minutes > 60) {
      return {
        hide: false,
        text: `You've used your searches for new addresses for now. Try again after ${waitEndsText(e.retryAfterSeconds ?? 0)}, or use your current location.`,
      }
    }
    return {
      hide: false,
      text: `Many address searches in a short time. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, or use your current location.`,
    }
  }
  if (code === 'VALIDATION_FAILED') {
    return { hide: false, text: 'Check the address, area, city and pincode above, then try again.' }
  }
  // GEOCODING_UNAVAILABLE, SERVICE_BUSY, offline, anything else
  return { hide: false, text: "Address search isn't working right now. Use your current location, or try again later." }
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

export const FILLED_TEXT = "We filled the address from your location. Check it and correct anything that's wrong."
