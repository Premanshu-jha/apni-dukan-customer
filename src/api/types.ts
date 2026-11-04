// Response and request shapes, written to match the backend's records
// (auth/api/AuthResponses.java, salon/api/BookingResponses.java, BookingRequests.java).
// Instants are ISO strings in UTC; dates are yyyy-MM-dd; money is in paise.

export interface User {
  id: string
  phone: string | null
  name: string | null
  email: string | null
  emailVerified: boolean
  admin: boolean
}

export interface Tokens {
  accessToken: string
  accessExpiresAt: string
  refreshToken: string
  refreshExpiresAt: string
  user: User
  newUser: boolean
}

export interface SalonSummary {
  id: string
  name: string
  area: string
  city: string
  distanceKm: number
  photoUrl: string | null
}

export interface DayHours {
  /** 1 = Monday … 7 = Sunday */
  weekday: number
  open: string
  close: string
}

export interface SalonDetails {
  id: string
  name: string
  addressLine: string
  area: string
  city: string
  pincode: string
  latitude: number
  longitude: number
  mapLink: string | null
  hours: DayHours[]
  pausedUntil: string | null
  photoUrl: string | null
}

export interface SalonService {
  id: string
  name: string
  durationMinutes: number
  pricePaise: number
  priceIsFrom: boolean
}

export interface Slot {
  startAt: string
  /** "16:30", India time */
  time: string
}

export interface Slots {
  date: string
  durationMinutes: number
  starts: Slot[]
}

export type BookingStatus =
  | 'CONFIRMED'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_SALON'
  | 'NO_SHOW'

export interface ServiceLine {
  serviceId: string
  name: string
  durationMinutes: number
  pricePaise: number
  priceIsFrom: boolean
}

export interface Booking {
  id: string
  bookingNo: string
  salonId: string
  salonName: string
  salonAddress: string
  mapLink: string | null
  services: ServiceLine[]
  totalPricePaise: number
  priceIsFrom: boolean
  startsAt: string
  endsAt: string
  /** Arrive by this time, or the booking may be marked a no-show. */
  heldUntil: string
  status: BookingStatus
  /** The 4-digit code to show at the salon; only while CONFIRMED. */
  startCode: string | null
  cancelReason: string | null
  /** Can still be cancelled. */
  canChange: boolean
  /** Can still be moved (not within 1 hour of the start). */
  canMove: boolean
  createdAt: string
}

export interface CancelResult {
  booking: Booking
  countedAsLate: boolean
}

export interface ErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}
