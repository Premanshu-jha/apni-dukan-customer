import { describe, expect, it } from 'vitest'
import { canRate } from './ratings'
import { offerBadgeText, offerWhat, offerWhen, openText, ratingText, servicesText } from './salonCard'

describe('salon cards', () => {
  it('shows the average from 5 ratings, "New" before', () => {
    expect(ratingText({ count: 0, average: null, tags: [] })).toBe('New')
    expect(ratingText({ count: 1, average: null, tags: [] })).toBe('New · 1 rating')
    expect(ratingText({ count: 4, average: null, tags: [] })).toBe('New · 4 ratings')
    expect(ratingText({ count: 120, average: 4.6, tags: [] })).toBe('★ 4.6 (120)')
    expect(ratingText({ count: 5, average: 4, tags: [] })).toBe('★ 4.0 (5)')
  })

  it('names the first services with prices and counts the rest', () => {
    const top = [
      { name: 'Haircut', pricePaise: 15000, priceIsFrom: false },
      { name: 'Hair colour', pricePaise: 80000, priceIsFrom: true },
    ]
    expect(servicesText(top, 2)).toBe('Haircut ₹150 · Hair colour from ₹800')
    expect(servicesText(top, 7)).toBe('Haircut ₹150 · Hair colour from ₹800 · +5 more')
    expect(servicesText([], 0)).toBe('')
  })

  it('says whether it is open, opens later, or is closed today', () => {
    const today = { weekday: 2, open: '10:00', close: '21:00' }
    expect(openText({ openNow: true, today, closedToday: false }, '12:00')).toBe('Open · till 9:00 PM')
    expect(openText({ openNow: false, today, closedToday: false }, '08:30')).toBe('Opens at 10:00 AM')
    expect(openText({ openNow: false, today, closedToday: false }, '21:30')).toBe('Closed now')
    expect(openText({ openNow: false, today: null, closedToday: true }, '12:00')).toBe('Closed today')
    expect(openText({ openNow: null, today: null, closedToday: false }, '12:00')).toBeNull()
  })

  it('lets a visit be rated only until rateUntil', () => {
    const now = Date.parse('2026-11-10T06:00:00Z')
    expect(canRate(null, now)).toBe(false)
    expect(canRate('2026-11-24T06:00:00Z', now)).toBe(true)
    expect(canRate('2026-11-10T06:00:00Z', now)).toBe(false)
  })
})

describe('offers', () => {
  it('badges a running, a last-day and a coming offer', () => {
    expect(offerBadgeText({ percentOff: 20, startsOn: '2026-11-10', endsOn: '2026-11-16' }, '2026-11-11')).toBe('20% off · till 16 Nov')
    expect(offerBadgeText({ percentOff: 20, startsOn: '2026-11-10', endsOn: '2026-11-11' }, '2026-11-11')).toBe('20% off · today')
    expect(offerBadgeText({ percentOff: 15, startsOn: '2026-11-14', endsOn: '2026-11-16' }, '2026-11-11')).toBe('15% off from 14 Nov')
  })

  it('says when and on what, like the message', () => {
    expect(offerWhen({ startsOn: '2026-11-12', endsOn: '2026-11-14', from: '12:00', until: '16:00' })).toBe('12 Nov – 14 Nov, 12:00–16:00')
    expect(offerWhen({ startsOn: '2026-12-01', endsOn: '2026-12-01', from: null, until: null })).toBe('1 Dec')
    const names = new Map([['a', 'Haircut'], ['b', 'Beard trim']])
    expect(offerWhat({ allServices: true, serviceIds: [] }, names)).toBe('on all services')
    expect(offerWhat({ allServices: false, serviceIds: ['a', 'gone'] }, names)).toBe('on Haircut')
  })
})
