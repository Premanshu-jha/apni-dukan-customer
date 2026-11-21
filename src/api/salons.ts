import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { ApiError, retryDelay, retryRead } from './errors'
import type { SalonDetails, SalonService, SalonSummary, Slots } from './types'

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** How often free times on screen are checked again. */
export const SLOTS_REFRESH_MS = 30_000

/** Every free-times list of every salon (to refresh them all when something changed). */
export const isSlotsKey = (key: readonly unknown[]) => key[0] === 'salons' && key[2] === 'slots'

export const salonKeys = {
  /** q: the search sent (searchQuery), '' for none: each search has its own pages, cached on their own. */
  near: (lat: number, lng: number, q = '') => ['salons', 'near', round6(lat), round6(lng), q] as const,
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
 * distance and id (keyset paging), so a dense area with hundreds of salons is never loaded at once. With `q` (from
 * searchQuery: 2 to 60 characters, or '' for all), only the salons whose name or one of whose services matches it,
 * in the same order and pages; every page carries the same q.
 */
export function useNearbySalons(lat: number | null, lng: number | null, q = '') {
  return useInfiniteQuery({
    queryKey: salonKeys.near(lat ?? 0, lng ?? 0, q),
    initialPageParam: null as SalonSummary | null,
    queryFn: ({ pageParam }) => {
      const after = pageParam
        ? `&afterDistance=${encodeURIComponent(String(pageParam.distanceMetres))}&afterId=${encodeURIComponent(pageParam.id)}`
        : ''
      // Each card's openNow is as of when its page was read: keep that moment with it ("Opens at …" is told from it)
      const search = q ? `&q=${encodeURIComponent(q)}` : ''
      return api<SalonSummary[]>('GET', `/api/v1/salons?lat=${round6(lat!)}&lng=${round6(lng!)}${search}${after}`).then((list) => {
        const readAt = Date.now()
        return list.map((s) => ({ ...s, readAt }))
      })
    },
    getNextPageParam: (last: SalonSummary[]) => (last.length < SALONS_PAGE ? undefined : last[last.length - 1]),
    enabled: lat !== null && lng !== null,
    staleTime: 60_000,
    // A search past the per-person limit is tried once more by itself, when Retry-After says (the words stay typed);
    // anything else as every read. A search changed meanwhile drops the wait (no screen watches it any more)
    retry: (count, e) => (q && isSearchLimited(e) ? count < 1 : retryRead(count, e)),
    retryDelay: (attempt, e) =>
      q && isSearchLimited(e) ? Math.min(e.retryAfterSeconds ?? SEARCH_WAIT_S, SEARCH_WAIT_MAX_S) * 1000 : retryDelay(attempt, e),
  })
}

/** Without a Retry-After, a limited search waits this long before its one more try; never longer than the max. */
const SEARCH_WAIT_S = 5
const SEARCH_WAIT_MAX_S = 60

/**
 * The backend limits searches (GET /salons with q) per person: past it, 429 TOO_MANY_REQUESTS with Retry-After
 * (seconds), as the salon pages' limit. The list without q has no limit.
 */
export function isSearchLimited(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 429 && e.code === 'TOO_MANY_REQUESTS'
}

export function useSalon(id: string) {
  return useQuery({
    queryKey: salonKeys.one(id),
    queryFn: () => api<SalonDetails>('GET', `/api/v1/salons/${id}`),
    staleTime: 60_000,
    enabled: id !== '',
  })
}

/**
 * Stops or allows again this salon's offer messages for me. The switch moves at once; a failure puts it back. Its
 * offers still show on its card and page either way.
 */
export function useSetOfferMessages(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (on: boolean) => api<{ on: boolean }>('PUT', `/api/v1/salons/${id}/offer-messages`, { body: { on } }),
    onMutate: (on) => {
      const before = qc.getQueryData<SalonDetails>(salonKeys.one(id))
      if (before) qc.setQueryData(salonKeys.one(id), { ...before, offerMessages: on })
      return { before }
    },
    onError: (_e, _on, ctx) => {
      const now = qc.getQueryData<SalonDetails>(salonKeys.one(id))
      if (now && ctx?.before) qc.setQueryData(salonKeys.one(id), { ...now, offerMessages: ctx.before.offerMessages })
    },
    // A refresh of the page while saving could have put the old value back: read it again
    onSettled: () => qc.invalidateQueries({ queryKey: salonKeys.one(id) }),
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
