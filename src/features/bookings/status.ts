import type { BookingStatus } from '../../api/types'

export const statusText: Record<BookingStatus, string> = {
  CONFIRMED: 'Booked',
  IN_SERVICE: 'In progress',
  COMPLETED: 'Done',
  CANCELLED_BY_CUSTOMER: 'Cancelled by you',
  CANCELLED_BY_SALON: 'Cancelled by the salon',
  NO_SHOW: 'Missed',
}

export const statusTone: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-brand/15 text-link',
  IN_SERVICE: 'bg-good/15 text-good',
  COMPLETED: 'bg-raised text-muted',
  CANCELLED_BY_CUSTOMER: 'bg-raised text-muted',
  CANCELLED_BY_SALON: 'bg-bad/15 text-bad',
  NO_SHOW: 'bg-bad/15 text-bad',
}

/**
 * The earlier time an "earlier slot" message offers (`?earlier=` on the link it opens), as an ISO instant, or null if
 * there is none or it isn't a time (a hand-typed link).
 */
export function earlierOffer(value: string | null): string | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Whether instant a is before instant b (as moments: "…:00Z" and "…:00.000Z" are the same time). */
export function isEarlier(a: string, b: string): boolean {
  return Date.parse(a) < Date.parse(b)
}
