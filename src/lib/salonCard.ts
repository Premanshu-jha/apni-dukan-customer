import type { Offer, OfferBadge, PriceLine, RatingSummary, SalonSummary } from '../api/types'
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Nov" for a yyyy-MM-dd date. */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** The card's badge: "20% off · today", "20% off · till 16 Nov", or "20% off from 14 Nov" while still to come. */
export function offerBadgeText(b: OfferBadge, today: string): string {
  if (b.startsOn > today) return `${b.percentOff}% off from ${shortDate(b.startsOn)}`
  return b.endsOn === today ? `${b.percentOff}% off · today` : `${b.percentOff}% off · till ${shortDate(b.endsOn)}`
}

/** "12 Nov – 14 Nov, 12:00–16:00", "12 Nov" for one day; the hours only when set. The same text as the message. */
export function offerWhen(o: Pick<Offer, 'startsOn' | 'endsOn' | 'from' | 'until'>): string {
  const days = o.startsOn === o.endsOn ? shortDate(o.startsOn) : `${shortDate(o.startsOn)} – ${shortDate(o.endsOn)}`
  return o.from && o.until ? `${days}, ${o.from}–${o.until}` : days
}

/** "on all services", or "on Haircut, Beard trim" (the salon's services it still offers; others are left out). */
export function offerWhat(o: Pick<Offer, 'allServices' | 'serviceIds'>, names: Map<string, string>): string {
  if (o.allServices) return 'on all services'
  const known = o.serviceIds.map((id) => names.get(id)).filter((n): n is string => !!n)
  return known.length ? `on ${known.join(', ')}` : 'on some services'
}

/** "31 Mar 2027" from "2027-03-31". */
export function licenceDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
