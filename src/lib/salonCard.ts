import type { PriceLine, RatingSummary, SalonSummary } from '../api/types'
import { clock12 } from './ist'
import { rupees } from './money'

/** "★ 4.6 (120)", or "New" until a salon has 5 ratings (with how many it has, once it has any). */
export function ratingText(r: RatingSummary): string {
  if (r.average === null) return r.count === 0 ? 'New' : `New · ${r.count} rating${r.count === 1 ? '' : 's'}`
  return `★ ${r.average.toFixed(1)} (${r.count})`
}

/** "Haircut ₹150 · Beard trim ₹80 · +3 more". */
export function servicesText(top: PriceLine[], count: number): string {
  const shown = top.map((s) => `${s.name} ${rupees(s.pricePaise, s.priceIsFrom)}`)
  const more = count - top.length
  return [...shown, ...(more > 0 ? [`+${more} more`] : [])].join(' · ')
}

/**
 * Whether it's open, for the card: "Open · till 9:00 PM", "Opens at 10:00 AM" (later today), "Closed now",
 * "Closed today"; null when the salon hasn't set its hours.
 */
export function openText(s: Pick<SalonSummary, 'openNow' | 'today' | 'closedToday'>, nowHHmm: string): string | null {
  if (s.closedToday) return 'Closed today'
  if (s.openNow === null) return null
  if (s.openNow && s.today) return `Open · till ${clock12(s.today.close)}`
  if (s.today && nowHHmm < s.today.open) return `Opens at ${clock12(s.today.open)}`
  return 'Closed now'
}
