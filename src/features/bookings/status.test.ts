import { describe, expect, it } from 'vitest'
import { isSlotsKey } from '../../api/salons'
import { earlierOffer, isEarlier } from './status'

describe('the earlier-time link', () => {
  it('reads the offered time as an instant, whatever its spelling', () => {
    expect(earlierOffer('2026-11-10T06:30:00Z')).toBe('2026-11-10T06:30:00.000Z')
    expect(earlierOffer('2026-11-10T06:30:00.000Z')).toBe('2026-11-10T06:30:00.000Z')
  })

  it('ignores a missing or broken one', () => {
    expect(earlierOffer(null)).toBeNull()
    expect(earlierOffer('')).toBeNull()
    expect(earlierOffer('not-a-time')).toBeNull()
  })

  it('compares moments, not text: the same time in two spellings is not earlier', () => {
    expect(isEarlier('2026-11-10T06:30:00.000Z', '2026-11-10T06:30:00Z')).toBe(false)
    expect(isEarlier('2026-11-10T06:15:00.000Z', '2026-11-10T06:30:00Z')).toBe(true)
    expect(isEarlier('2026-11-10T06:45:00Z', '2026-11-10T06:30:00.000Z')).toBe(false)
  })
})

describe('free-time lists', () => {
  it('are told apart from the other salon queries', () => {
    expect(isSlotsKey(['salons', 's1', 'slots', ['v1'], '2026-11-10', null])).toBe(true)
    expect(isSlotsKey(['salons', 's1', 'services'])).toBe(false)
    expect(isSlotsKey(['salons', 'near', 28.6, 77.3])).toBe(false)
    expect(isSlotsKey(['bookings', 'upcoming'])).toBe(false)
  })
})
