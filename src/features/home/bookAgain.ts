import type { Booking } from '../../api/types'

/** The salon and services of a booking, as a link that opens that salon with those services already ticked. */
export function bookAgainLink(b: Pick<Booking, 'salonId' | 'services'>): string {
  const ids = b.services.map((s) => s.serviceId).join(',')
  return `/salons/${encodeURIComponent(b.salonId)}${ids ? `?services=${encodeURIComponent(ids)}` : ''}`
}
