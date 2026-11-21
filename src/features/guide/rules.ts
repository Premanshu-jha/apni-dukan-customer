import { FREE_CANCEL_MINUTES } from '../bookings/lateCancel'

/**
 * The backend's booking rules the guide's texts name (BookingService): a cancel is late from 1 hour before the start,
 * free for 10 minutes after booking; 3 missed or late-cancelled bookings within 60 days pause online booking for 30
 * days. The variables of guide.rulesLine (Home's How booking works) and salon.bookRules (under Book now).
 */
export const BOOKING_RULES = {
  hours: 1,
  minutes: FREE_CANCEL_MINUTES,
  strikes: 3,
  days: 60,
  pause: 30,
}
