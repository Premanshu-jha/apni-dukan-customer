import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { ApiError } from './errors'
import type { Booking, CancelResult } from './types'

export const bookingKeys = {
  mine: (when: 'upcoming' | 'past') => ['bookings', when] as const,
  one: (id: string) => ['bookings', 'one', id] as const,
}

export function useMyBookings(when: 'upcoming' | 'past') {
  return useQuery({
    queryKey: bookingKeys.mine(when),
    queryFn: () => api<Booking[]>('GET', `/api/v1/me/bookings?when=${when}`),
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
    mutationFn: (v: { salonId: string; serviceIds: string[]; startAt: string; idempotencyKey: string }) =>
      api<Booking>('POST', '/api/v1/bookings', {
        body: { salonId: v.salonId, serviceIds: v.serviceIds, startAt: v.startAt },
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

export function useMoveBooking() {
  const refresh = useRefreshAfterChange()
  const slotsGone = useRefreshSlotsOnTaken()
  return useMutation({
    mutationFn: (v: { id: string; salonId: string; startAt: string }) =>
      api<Booking>('POST', `/api/v1/bookings/${v.id}/reschedule`, { body: { startAt: v.startAt } }),
    onSuccess: refresh,
    onError: (e, v) => slotsGone(e, v.salonId),
  })
}
