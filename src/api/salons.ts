import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { SalonDetails, SalonService, SalonSummary, Slots } from './types'

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** How often free times on screen are checked again. */
export const SLOTS_REFRESH_MS = 30_000

/** Every free-times list of every salon (to refresh them all when something changed). */
export const isSlotsKey = (key: readonly unknown[]) => key[0] === 'salons' && key[2] === 'slots'

export const salonKeys = {
  near: (lat: number, lng: number) => ['salons', 'near', round6(lat), round6(lng)] as const,
  one: (id: string) => ['salons', id] as const,
  services: (id: string) => ['salons', id, 'services'] as const,
  slots: (id: string, services: string[], date: string, moving?: string) =>
    ['salons', id, 'slots', [...services].sort(), date, moving ?? null] as const,
}

/** Salons per page from the backend (BookingService.SALONS_PAGE); a shorter page is the last one. */
export const SALONS_PAGE = 30
/** How far around the customer salons are listed (BookingService.RADIUS_METRES). */
export const SALONS_RADIUS_KM = 2

/**
 * Salons near the customer, nearest first, a page at a time. The next page starts after the last salon's exact
 * distance and id (keyset paging), so a dense area with hundreds of salons is never loaded at once.
 */
export function useNearbySalons(lat: number | null, lng: number | null) {
  return useInfiniteQuery({
    queryKey: salonKeys.near(lat ?? 0, lng ?? 0),
    initialPageParam: null as SalonSummary | null,
    queryFn: ({ pageParam }) => {
      const after = pageParam
        ? `&afterDistance=${encodeURIComponent(String(pageParam.distanceMetres))}&afterId=${encodeURIComponent(pageParam.id)}`
        : ''
      // Each card's openNow is as of when its page was read: keep that moment with it ("Opens at …" is told from it)
      return api<SalonSummary[]>('GET', `/api/v1/salons?lat=${round6(lat!)}&lng=${round6(lng!)}${after}`).then((list) => {
        const readAt = Date.now()
        return list.map((s) => ({ ...s, readAt }))
      })
    },
    getNextPageParam: (last: SalonSummary[]) => (last.length < SALONS_PAGE ? undefined : last[last.length - 1]),
    enabled: lat !== null && lng !== null,
    staleTime: 60_000,
  })
}

export function useSalon(id: string) {
  return useQuery({
    queryKey: salonKeys.one(id),
    queryFn: () => api<SalonDetails>('GET', `/api/v1/salons/${id}`),
    staleTime: 60_000,
    enabled: id !== '',
  })
}

export function useSalonServices(id: string) {
  return useQuery({
    queryKey: salonKeys.services(id),
    queryFn: () => api<SalonService[]>('GET', `/api/v1/salons/${id}/services`),
    staleTime: 60_000,
  })
}

/** @param moving a booking of mine being moved: the backend counts its own time as free */
export function useSlots(id: string, services: string[], date: string, moving?: string) {
  const params = new URLSearchParams()
  services.forEach((s) => params.append('services', s))
  params.set('date', date)
  if (moving) params.set('moving', moving)
  return useQuery({
    queryKey: salonKeys.slots(id, services, date, moving),
    queryFn: () => api<Slots>('GET', `/api/v1/salons/${id}/availability?${params.toString()}`),
    enabled: services.length > 0,
    staleTime: 15_000,
    // Others book and cancel all the time: while the times are on screen, check again every 30 s (and at once when
    // a message arrives, see main.tsx), so a time just taken goes and one just freed appears without a reload
    refetchInterval: SLOTS_REFRESH_MS,
    retry: false,
  })
}

/** The backend's default booking window (a salon whose owner never set one): today plus 7 days. */
export const DEFAULT_MAX_DAYS_AHEAD = 7

/**
 * How many day chips a salon gets: today plus its `maxDaysAhead` (the owner's setting, 1 to 30; the backend answers
 * OUTSIDE_WINDOW past it). Missing (not read yet, or an older backend) or out of range: today plus the backend's
 * default 7, so 8 chips.
 */
export function daysShown(maxDaysAhead: number | undefined): number {
  if (typeof maxDaysAhead !== 'number' || !Number.isInteger(maxDaysAhead) || maxDaysAhead < 1) return DEFAULT_MAX_DAYS_AHEAD + 1
  return Math.min(maxDaysAhead, 30) + 1
}
