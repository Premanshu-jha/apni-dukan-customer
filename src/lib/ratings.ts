import type { RatingTag } from '../api/types'
import { t } from '../i18n'

/** What went well, as a customer can tick it (RatingTag on the backend). */
export const TAGS: Array<{ tag: RatingTag; label: string }> = [
  { tag: 'ON_TIME', label: 'On time' },
  { tag: 'CLEAN', label: 'Clean' },
  { tag: 'FRIENDLY', label: 'Friendly' },
  { tag: 'SKILLED', label: 'Skilled' },
  { tag: 'GOOD_VALUE', label: 'Good value' },
]

/** The key of each "what went well" tag's words (TAGS keeps the English label, used if a key is missing). */
export const TAG_KEYS: Record<RatingTag, string> = {
  ON_TIME: 'ratings.tagOnTime',
  CLEAN: 'ratings.tagClean',
  FRIENDLY: 'ratings.tagFriendly',
  SKILLED: 'ratings.tagSkilled',
  GOOD_VALUE: 'ratings.tagGoodValue',
}

/** A tag in the app's language; a tag this app doesn't know yet: the backend's own label. */
export function tagText(tag: RatingTag, label?: string): string {
  const key = TAG_KEYS[tag]
  return key ? t(key, undefined, label ?? TAGS.find((x) => x.tag === tag)?.label) : (label ?? tag)
}

/** The backend keeps up to 300 characters (BookingRequests.RateVisit). */
export const MAX_COMMENT = 300

/** Whether the visit can still be rated (or its rating changed) at this moment. */
export function canRate(rateUntil: string | null, now: number): boolean {
  return rateUntil !== null && Date.parse(rateUntil) > now
}
