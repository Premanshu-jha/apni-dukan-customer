import type { Booking } from '../../api/types'
import type { CancelTerms } from '../../store/bookingDraft'

/** A cancel this close to the start counts as late (the backend's LATE_CANCEL), unless soon after booking. */
export const LATE_CANCEL_MS = 60 * 60_000
/** A booking can be cancelled without a strike for this long after it is made (the backend's freeCancelMinutes). */
export const FREE_CANCEL_MINUTES = 10

/**
 * The cancel terms of a time about to be booked: the ones the free times gave with it, or (a draft saved before
 * the backend sent them) the same rule worked out here: late from 1 hour before the start, 10 free minutes.
 */
export function termsFor(startAt: string, terms: CancelTerms | null | undefined): Omit<CancelTerms, 'startAt'> {
  if (terms && terms.startAt === startAt) return terms
  return { lateCancelFrom: new Date(Date.parse(startAt) - LATE_CANCEL_MS).toISOString(), freeCancelMinutes: FREE_CANCEL_MINUTES }
}

/**
 * True when booking this time now leaves less than the free minutes before a cancel would count as late (it starts
 * within about 1 hour 10 minutes): it can't be moved, and a cancel counts as late once the free minutes are over.
 */
export function lateCancelSoon(lateCancelFrom: string, freeCancelMinutes: number, now: number = Date.now()): boolean {
  return Date.parse(lateCancelFrom) - now < freeCancelMinutes * 60_000
}

/** A booking's own moment from which a cancel is late; one from an older backend: 1 hour before its start. */
export function lateCancelFromOf(b: Pick<Booking, 'startsAt' | 'lateCancelFrom'>): string {
  return b.lateCancelFrom ?? new Date(Date.parse(b.startsAt) - LATE_CANCEL_MS).toISOString()
}

/** Cancelling now would count as late: past the moment (at it, it is not). */
export function cancelIsLate(b: Pick<Booking, 'startsAt' | 'lateCancelFrom'>, now: number = Date.now()): boolean {
  return now > Date.parse(lateCancelFromOf(b))
}
