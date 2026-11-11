import { describe, expect, it } from 'vitest'
import { nearText } from './places'

describe('the address near the current location, in a few words', () => {
  const at = { addressLine: 'Lake View Apartments', area: 'Kondapur', city: 'Hyderabad', formattedAddress: 'Lake View Apartments, Kondapur, Hyderabad 500084' }

  it('is the building and the area when both are known', () => {
    expect(nearText(at)).toBe('Lake View Apartments, Kondapur')
  })

  it('falls back to what there is, then to the start of the full address, else nothing', () => {
    expect(nearText({ ...at, addressLine: ' ' })).toBe('Kondapur, Hyderabad')
    expect(nearText({ ...at, area: '' })).toBe('Lake View Apartments, Hyderabad')
    expect(nearText({ addressLine: '', area: '', city: '', formattedAddress: 'NH 65, Miyapur, Hyderabad' })).toBe('NH 65, Miyapur')
    expect(nearText({ addressLine: '', area: '', city: '', formattedAddress: '' })).toBeNull()
  })
})
