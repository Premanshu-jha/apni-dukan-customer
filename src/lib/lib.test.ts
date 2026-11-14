import { addDays, clock12, dateOfIst, dayLabel, endTimeIst, greeting, nextDates, timeIst, todayIst, weekdayName } from './ist'
import { bookAgainLink } from '../features/home/bookAgain'
import { clashesWithMine } from '../features/salon/clash'
import { duration, rupees } from './money'
import { formatPhone, looksLikeEmail, normalizePhone } from './phone'

describe('India time', () => {
  // 20:00 UTC on 4 Nov is 01:30 on 5 Nov in India.
  const lateUtc = new Date('2026-11-04T20:00:00Z')

  it('uses the India date, not the phone or UTC date', () => {
    expect(todayIst(lateUtc)).toBe('2026-11-05')
    expect(dateOfIst('2026-11-04T20:00:00Z')).toBe('2026-11-05')
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('lists the next days starting today', () => {
    expect(nextDates(3, lateUtc)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
  })

  it('names days', () => {
    expect(dayLabel('2026-11-05', lateUtc)).toBe('Today')
    expect(dayLabel('2026-11-06', lateUtc)).toBe('Tomorrow')
    expect(dayLabel('2026-11-09', lateUtc)).toBe('Mon 9 Nov')
  })

  it('shows times in India', () => {
    expect(timeIst('2026-11-05T11:00:00Z')).toBe('4:30 PM')
    expect(clock12('09:05')).toBe('9:05 AM')
    expect(clock12('12:00')).toBe('12:00 PM')
    expect(clock12('00:30')).toBe('12:30 AM')
    expect(clock12('24:00')).toBe('midnight')   // a salon open till the end of the day
    expect(weekdayName(1)).toBe('Mon')
    expect(weekdayName(7)).toBe('Sun')
  })
})

describe('money and durations', () => {
  it('formats paise as rupees', () => {
    expect(rupees(25000)).toBe('₹250')
    expect(rupees(125000)).toBe('₹1,250')
    expect(rupees(9950)).toBe('₹99.50')
    expect(rupees(30000, true)).toBe('from ₹300')
  })
  it('formats durations', () => {
    expect(duration(45)).toBe('45 min')
    expect(duration(60)).toBe('1 h')
    expect(duration(90)).toBe('1 h 30 min')
  })
})

describe('phone numbers', () => {
  it('accepts what people type, like the backend', () => {
    expect(normalizePhone('+91 98480 12345')).toBe('9848012345')
    expect(normalizePhone('098480-12345')).toBe('9848012345')
    expect(normalizePhone('9848012345')).toBe('9848012345')
  })
  it('rejects numbers that are not Indian mobiles', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('5848012345')).toBeNull()
  })
  it('formats and checks', () => {
    expect(formatPhone('9848012345')).toBe('98480 12345')
    expect(looksLikeEmail('a@b.in')).toBe(true)
    expect(looksLikeEmail('a@b')).toBe(false)
  })
})

describe('day chips for a salon', () => {
  it('shows today plus its maxDaysAhead (1–30), else today plus the backend default 7 (8 chips)', async () => {
    const { daysShown } = await import('../api/salons')
    expect(daysShown(1)).toBe(2)
    expect(daysShown(30)).toBe(31)
    expect(daysShown(45)).toBe(31)
    expect(daysShown(undefined)).toBe(8)
    expect(daysShown(0)).toBe(8)
    expect(daysShown(2.5)).toBe(8)
  })
})

describe('when a visit ends, and the greeting', () => {
  it('adds the services\' minutes to the start, in India time, across noon and midnight', () => {
    expect(endTimeIst('2026-11-14T04:30:00Z', 30)).toBe('10:30 AM')    // 10:00 IST
    expect(endTimeIst('2026-11-14T06:15:00Z', 45)).toBe('12:30 PM')    // 11:45 IST
    expect(endTimeIst('2026-11-14T18:00:00Z', 60)).toBe('12:30 AM')    // 11:30 PM IST
  })

  it('says morning, afternoon or evening by the clock in India, whatever the phone\'s zone', () => {
    const at = (ist: string) => new Date(`2026-11-14T${ist}:00+05:30`)
    expect(greeting(at('05:00'))).toBe('Good morning')
    expect(greeting(at('11:59'))).toBe('Good morning')
    expect(greeting(at('12:00'))).toBe('Good afternoon')
    expect(greeting(at('16:59'))).toBe('Good afternoon')
    expect(greeting(at('17:00'))).toBe('Good evening')
    expect(greeting(at('23:30'))).toBe('Good evening')
    expect(greeting(at('02:00'))).toBe('Good evening')
  })

  it('book again opens the same salon with the same services', () => {
    const services = [{ serviceId: 'v1' }, { serviceId: 'v2' }] as never
    expect(bookAgainLink({ salonId: 's1', services })).toBe('/salons/s1?services=v1%2Cv2')
    expect(bookAgainLink({ salonId: 's1', services: [] })).toBe('/salons/s1')
  })
})

describe('free times that clash with my own bookings', () => {
  const b = (id: string, status: string, start: string, end: string) =>
    ({ id, status, startsAt: start, endsAt: end }) as never
  const mine = [b('b1', 'CONFIRMED', '2026-11-15T06:30:00Z', '2026-11-15T07:00:00Z')]   // 12:00–12:30 IST
  it('leaves out a visit overlapping mine, keeps one only touching it', () => {
    expect(clashesWithMine('2026-11-15T06:15:00Z', 30, mine)).toBe(true)    // 11:45–12:15
    expect(clashesWithMine('2026-11-15T06:45:00Z', 30, mine)).toBe(true)    // 12:15–12:45
    expect(clashesWithMine('2026-11-15T06:00:00Z', 30, mine)).toBe(false)   // 11:30–12:00 touches
    expect(clashesWithMine('2026-11-15T07:00:00Z', 30, mine)).toBe(false)   // 12:30 touches
  })
  it('ignores the booking being moved, and cancelled or finished ones', () => {
    expect(clashesWithMine('2026-11-15T06:30:00Z', 30, mine, 'b1')).toBe(false)
    expect(clashesWithMine('2026-11-15T06:30:00Z', 30, [b('b2', 'CANCELLED_BY_SALON', '2026-11-15T06:30:00Z', '2026-11-15T07:00:00Z')])).toBe(false)
    expect(clashesWithMine('2026-11-15T06:30:00Z', 30, [b('b3', 'IN_SERVICE', '2026-11-15T06:30:00Z', '2026-11-15T07:00:00Z')])).toBe(true)
  })
})
