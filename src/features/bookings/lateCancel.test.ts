import { describe, expect, it } from 'vitest'
import { cancelIsLate, lateCancelFromOf, lateCancelSoon, termsFor } from './lateCancel'

const now = Date.parse('2026-11-07T10:00:00Z')
const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString()

describe('late cancel', () => {
  it('warns when lateCancelFrom is less than the free minutes away (a start under 1 h 10 min away)', () => {
    expect(lateCancelSoon(at(9), 10, now)).toBe(true)
    expect(lateCancelSoon(at(-5), 10, now)).toBe(true)
    expect(lateCancelSoon(at(10), 10, now)).toBe(false)
    expect(lateCancelSoon(at(120), 10, now)).toBe(false)
  })

  it('uses the terms given with the picked time, else 1 hour before the start and 10 minutes', () => {
    const start = at(75)
    expect(termsFor(start, { startAt: start, lateCancelFrom: at(5), freeCancelMinutes: 15 })).toMatchObject({
      lateCancelFrom: at(5),
      freeCancelMinutes: 15,
    })
    // Terms of another time (picked before) don't apply
    expect(termsFor(start, { startAt: at(90), lateCancelFrom: at(30), freeCancelMinutes: 10 })).toEqual({
      lateCancelFrom: at(15),
      freeCancelMinutes: 10,
    })
    expect(termsFor(start, undefined)).toEqual({ lateCancelFrom: at(15), freeCancelMinutes: 10 })
  })

  it('a cancel is late only after the booking\'s lateCancelFrom (at it, not)', () => {
    expect(cancelIsLate({ startsAt: at(50), lateCancelFrom: at(0) }, now)).toBe(false)
    expect(cancelIsLate({ startsAt: at(50), lateCancelFrom: at(-1) }, now)).toBe(true)
    expect(cancelIsLate({ startsAt: at(50), lateCancelFrom: at(5) }, now)).toBe(false)
    // An older backend without lateCancelFrom: 1 hour before the start
    expect(lateCancelFromOf({ startsAt: at(90) })).toBe(at(30))
    expect(cancelIsLate({ startsAt: at(50) }, now)).toBe(true)
  })
})
