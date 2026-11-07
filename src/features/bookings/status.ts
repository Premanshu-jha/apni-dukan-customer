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
