import { create } from 'zustand'
import { storage } from '../lib/storage'

const KEY = 'ad.location'
const CHOSEN_KEY = 'ad.chosenPlace'

export interface Place {
  lat: number
  lng: number
  /** Metres, as the phone reported it. */
  accuracy: number
  at: number
}

/** Worse than this and the results may be off (laptops guess from the internet connection). */
export const ROUGH_METRES = 1000

/** A saved place older than this is checked again (the person may be somewhere else now). */
export const STALE_MS = 30 * 60_000

export type LocateError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

/**
 * A saved place picked to find salons near (instead of the phone's GPS point). The point and words are a copy of the
 * saved place as it was picked; Home puts them right when the list says it changed, or forgets the choice when the
 * place was deleted (here or on another phone).
 */
export interface ChosenPlace {
  id: string
  /** "Home", "Work" or its own name. */
  label: string
  /** "Flat 4B, Kondapur". */
  short: string
  lat: number
  lng: number
}

interface LocationState {
  place: Place | null
  /** null: salons near the phone's GPS point. */
  chosen: ChosenPlace | null
  finding: boolean
  error: LocateError | null
  locate: () => Promise<void>
  /** Picks a saved place, or (null) goes back to the current location. */
  choose: (p: ChosenPlace | null) => void
  clear: () => void
}

export const useLocation = create<LocationState>((set) => ({
  place: storage.getJson<Place>(KEY),
  chosen: storage.getJson<ChosenPlace>(CHOSEN_KEY),
  finding: false,
  error: null,

  choose: (chosen) => {
    if (chosen) storage.setJson(CHOSEN_KEY, chosen)
    else storage.remove(CHOSEN_KEY)
    set({ chosen })
  },

  locate: () =>
    new Promise<void>((resolve) => {
      if (!('geolocation' in navigator)) {
        set({ error: 'unsupported' })
        resolve()
        return
      }
      set({ finding: true, error: null })
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const place: Place = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            at: Date.now(),
          }
          storage.setJson(KEY, place)
          set({ place, finding: false, error: null })
          resolve()
        },
        (err) => {
          const error: LocateError =
            err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable'
          set({ finding: false, error })
          resolve()
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      )
    }),

  /** Signing out: neither the last GPS point nor a saved address stays for the next person on this phone. */
  clear: () => {
    storage.remove(KEY)
    storage.remove(CHOSEN_KEY)
    set({ place: null, chosen: null, error: null })
  },
}))

/** 'denied' when the browser already says no, so the guide can show without asking again. */
export async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}
