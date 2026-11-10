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

export type RatingTag = 'ON_TIME' | 'CLEAN' | 'FRIENDLY' | 'SKILLED' | 'GOOD_VALUE'

export interface TagCount {
  tag: RatingTag
  label: string
  count: number
}

/** A salon's ratings. average is null until it has 5 ratings (the app shows "New"). */
export interface RatingSummary {
  count: number
  average: number | null
  /** What customers said went well, most mentioned first (empty on the list's cards). */
  tags: TagCount[]
}

/** A service's name and price on a salon card. */
export interface PriceLine {
  name: string
  pricePaise: number
  priceIsFrom: boolean
}

export interface SalonSummary {
  id: string
  name: string
  addressLine: string
  area: string
  city: string
  distanceKm: number
  photoUrl: string | null
  /** Exact distance in metres: sent back to ask for the next page */
  distanceMetres: number
  rating: RatingSummary
  /** Its first 3 services, with prices. */
  topServices: PriceLine[]
  /** How many services in all ("+5 more"). */
  serviceCount: number
  /** Today's hours; null when closed today or not set. */
  today: DayHours | null
  /** Open right now; null when the salon hasn't set its hours. */
  openNow: boolean | null
  /** Its weekly off or a holiday. */
  closedToday: boolean
  /** It added its registration document (optional for salons): "Registered", else "Unregistered". */
  registered: boolean
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
  /** How many days after today it takes online bookings (1–30, the owner's setting); missing from older backends. */
  maxDaysAhead?: number
  /** Its closed days (holidays) within its booking window, yyyy-MM-dd. */
  closedDates: string[]
  rating: RatingSummary
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
  /** 1 hour before the start: a cancel after it counts as late, unless within freeCancelMinutes of booking. */
  lateCancelFrom?: string
}

export interface Slots {
  date: string
  durationMinutes: number
  /** A booking can be cancelled without a strike for this long after it is made (10), whatever its start. */
  freeCancelMinutes?: number
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
  /** A cancel after this moment counts as late: the later of 1 hour before the start and 10 minutes after booking. */
  lateCancelFrom?: string
  /**
   * "Tell me if an earlier slot opens": a message comes when someone's cancel or move frees an earlier time that day.
   * Missing from a backend older than V33 (then it is off).
   */
  earlierAlert?: boolean
  /** My rating of this visit; null if not rated. */
  rating: MyRating | null
  /** While set, I can rate the visit (or change my rating) until then: 14 days after a completed visit. */
  rateUntil: string | null
}

export interface MyRating {
  stars: number
  tags: RatingTag[]
  /** Only the salon sees it. */
  comment: string | null
  ratedAt: string
  updatedAt: string
}

export interface RateVisit {
  stars: number
  tags: RatingTag[]
  comment: string | null
}

export interface SalonPreferences {
  /** "Time for your next haircut?" messages after a visit. */
  comeBackReminders: boolean
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
