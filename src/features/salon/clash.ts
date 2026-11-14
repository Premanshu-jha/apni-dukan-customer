import type { Booking } from '../../api/types'

/**
 * Whether a visit starting at `startAt` for `minutes` would overlap one of my own bookings still to come or under
 * way (not `except`, the one being moved). The backend refuses such a booking 409 OVERLAPS_YOUR_BOOKING; the free
 * times leave it out here, from the bookings the app already holds, so the backend reads nothing more per check.
 * [start, end): a visit ending as another starts doesn't overlap it.
 */
export function clashesWithMine(startAt: string, minutes: number, mine: Booking[], except?: string): boolean {
  const from = Date.parse(startAt)
  const to = from + minutes * 60_000
  return mine.some(
    (b) =>
      b.id !== except &&
      (b.status === 'CONFIRMED' || b.status === 'IN_SERVICE') &&
      Date.parse(b.startsAt) < to &&
      Date.parse(b.endsAt) > from,
  )
}
