import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { ApiError, isApiError } from './errors'
import { cursorQuery, nextAfterLast, type AfterCursor } from './pages'
import type { Booking, CancelResult, RateVisit, SalonPreferences } from './types'

export const bookingKeys = {
  mine: (when: 'upcoming' | 'past') => ['bookings', when] as const,
  one: (id: string) => ['bookings', 'one', id] as const,
}

/** Upcoming bookings: all of them in one answer (a customer holds at most 2 waiting; the backend has no pages here). */
export function useUpcomingBookings() {
  return useQuery({
    queryKey: bookingKeys.mine('upcoming'),
    queryFn: () => api<Booking[]>('GET', '/api/v1/me/bookings?when=upcoming'),
  })
}

/** Past bookings per page (BookingService.PAST_PAGE); a shorter page is the last one. */
export const PAST_PAGE = 30
/**
 * At most this many pages are loaded (300 bookings). A refresh (after a booking changes, on return to the app) asks
 * every loaded page again, one after the other, so the pages stay joined; the cap keeps that to 10 small calls, each
 * a 304 when unchanged. TanStack's `maxPages` would drop the latest page and the backend has no "page before".
 */
export const PAST_MAX_PAGES = 10

/**
 * Past bookings, latest first, 30 a page: the next page starts after the last booking's startsAt and id, sent back
 * exactly as received (keyset paging), so years of bookings are never loaded at once.
 */
export function usePastBookings() {
  return useInfiniteQuery({
    queryKey: bookingKeys.mine('past'),
    initialPageParam: null as AfterCursor | null,
    queryFn: ({ pageParam }) => api<Booking[]>('GET', `/api/v1/me/bookings?when=past${cursorQuery(pageParam)}`),
    getNextPageParam: (last: Booking[], all: Booking[][]) => nextAfterLast(last, all, PAST_PAGE, PAST_MAX_PAGES),
  })
}

/**
 * Whether any past booking comes after the capped list: the page after the last loaded one, asked once (again when
 * bookings are refreshed), only to say yes or no. Without it the note at the cap would show when exactly 300 exist.
 */
export function useMorePastAfterCap(after: AfterCursor | null) {
  return useQuery({
    queryKey: [...bookingKeys.mine('past'), 'after-cap', after?.afterStart ?? null, after?.afterId ?? null],
    queryFn: () => api<Booking[]>('GET', `/api/v1/me/bookings?when=past${cursorQuery(after)}`),
    enabled: after !== null,
    select: (page: Booking[]) => page.length > 0,
  })
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: bookingKeys.one(id),
    queryFn: () => api<Booking>('GET', `/api/v1/bookings/${id}`),
    // Status changes at the salon (started, done, missed); keep it fresh while it can still change.
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'CONFIRMED' || s === 'IN_SERVICE' ? 30_000 : false
    },
  })
}

/** After any change: bookings and the salon's free times are stale. */
function useRefreshAfterChange() {
  const qc = useQueryClient()
  return (booking: Booking) => {
    qc.setQueryData(bookingKeys.one(booking.id), booking)
    void qc.invalidateQueries({ queryKey: ['bookings'] })
    void qc.invalidateQueries({ queryKey: ['salons', booking.salonId, 'slots'] })
  }
}

/** A time someone else just took: the salon's free times shown on screen are out of date. */
function useRefreshSlotsOnTaken() {
  const qc = useQueryClient()
  return (error: unknown, salonId: string) => {
    if (error instanceof ApiError && error.code === 'SLOT_TAKEN') {
      void qc.invalidateQueries({ queryKey: ['salons', salonId, 'slots'] })
    }
  }
}

export function useBook() {
  const refresh = useRefreshAfterChange()
  const slotsGone = useRefreshSlotsOnTaken()
  return useMutation({
    mutationFn: (v: {
      salonId: string
      serviceIds: string[]
      startAt: string
      idempotencyKey: string
      earlierAlert: boolean
    }) =>
      api<Booking>('POST', '/api/v1/bookings', {
        // Only when on: a backend from before V33 refuses an unknown field, so "off" is sent as nothing at all
        body: {
          salonId: v.salonId,
          serviceIds: v.serviceIds,
          startAt: v.startAt,
          ...(v.earlierAlert ? { earlierAlert: true } : {}),
        },
        headers: { 'Idempotency-Key': v.idempotencyKey },
      }),
    onSuccess: refresh,
    onError: (e, v) => slotsGone(e, v.salonId),
  })
}

export function useCancelBooking() {
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: (id: string) => api<CancelResult>('POST', `/api/v1/bookings/${id}/cancel`),
    onSuccess: (r) => refresh(r.booking),
  })
}

/** "Tell me if an earlier slot opens" on or off for one of my bookings. */
export function useEarlierAlert() {
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: (v: { id: string; on: boolean }) =>
      api<Booking>('PUT', `/api/v1/bookings/${v.id}/earlier-alert`, { body: { on: v.on } }),
    onSuccess: refresh,
  })
}

export function useRateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; rating: RateVisit }) =>
      api<Booking>('POST', `/api/v1/bookings/${v.id}/rating`, { body: v.rating }),
    onSuccess: (b) => {
      qc.setQueryData(bookingKeys.one(b.id), b)
      void qc.invalidateQueries({ queryKey: ['bookings', 'past'] })
      // The salon's average and count on its page and card
      void qc.invalidateQueries({ queryKey: ['salons'] })
    },
    onError: (e, v) => {
      // Closed meanwhile (14 days passed while the form was open): read the booking again, the form goes read-only
      if (isApiError(e, 'RATING_CLOSED')) void qc.invalidateQueries({ queryKey: bookingKeys.one(v.id) })
    },
  })
}

export const prefsKey = ['me', 'salon-preferences'] as const

export function useSalonPreferences() {
  return useQuery({ queryKey: prefsKey, queryFn: () => api<SalonPreferences>('GET', '/api/v1/me/salon-preferences') })
}

export function useSetSalonPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: SalonPreferences) => api<SalonPreferences>('PUT', '/api/v1/me/salon-preferences', { body: p }),
    // The switch moves at once; a failure puts it back
    onMutate: (p) => {
      const before = qc.getQueryData<SalonPreferences>(prefsKey)
      qc.setQueryData(prefsKey, p)
      return { before }
    },
    onError: (_e, _p, ctx) => qc.setQueryData(prefsKey, ctx?.before),
    onSuccess: (p) => qc.setQueryData(prefsKey, p),
  })
}

export function useMoveBooking() {
  const refresh = useRefreshAfterChange()
  const slotsGone = useRefreshSlotsOnTaken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; salonId: string; startAt: string }) =>
      api<Booking>('POST', `/api/v1/bookings/${v.id}/reschedule`, { body: { startAt: v.startAt } }),
    onSuccess: refresh,
    onError: (e, v) => {
      slotsGone(e, v.salonId)
      // Refused for a reason about the booking itself (its last hour, the salon paused): show what it can do now
      if (e instanceof ApiError && e.status > 0) void qc.invalidateQueries({ queryKey: bookingKeys.one(v.id) })
    },
  })
}
