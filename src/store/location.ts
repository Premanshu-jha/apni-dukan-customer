import { create } from 'zustand'
import { storage } from '../lib/storage'

const KEY = 'ad.location'

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

interface LocationState {
  place: Place | null
  finding: boolean
  error: LocateError | null
  locate: () => Promise<void>
  clear: () => void
}

export const useLocation = create<LocationState>((set) => ({
  place: storage.getJson<Place>(KEY),
  finding: false,
  error: null,

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

  clear: () => {
    storage.remove(KEY)
    set({ place: null, error: null })
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
