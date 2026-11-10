import type { RatingTag } from '../api/types'

/** What went well, as a customer can tick it (RatingTag on the backend). */
export const TAGS: Array<{ tag: RatingTag; label: string }> = [
  { tag: 'ON_TIME', label: 'On time' },
  { tag: 'CLEAN', label: 'Clean' },
  { tag: 'FRIENDLY', label: 'Friendly' },
  { tag: 'SKILLED', label: 'Skilled' },
  { tag: 'GOOD_VALUE', label: 'Good value' },
]

/** The backend keeps up to 300 characters (BookingRequests.RateVisit). */
export const MAX_COMMENT = 300

/** Whether the visit can still be rated (or its rating changed) at this moment. */
export function canRate(rateUntil: string | null, now: number): boolean {
  return rateUntil !== null && Date.parse(rateUntil) > now
}
