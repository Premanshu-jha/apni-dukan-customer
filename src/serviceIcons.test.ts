import { describe, expect, it } from 'vitest'
import { ICON_DRAWINGS, iconOf, iconsFor, SERVICE_ICONS } from './lib/serviceIcons'

// The same file as the partner app's (its tests cover every way a name is written); here: what the customer sees
describe('a service’s picture', () => {
  it('is the owner’s choice, or else the one its name fits', () => {
    expect(iconOf({ name: 'Haircut', icon: 'OTHER' })).toBe('OTHER')
    expect(iconOf({ name: 'Beard trim' })).toBe('BEARD')
    expect(iconOf({ name: 'massage Head', icon: null })).toBe('MASSAGE')
    expect(iconOf({ name: 'Something new', icon: 'NOT_ONE' })).toBe('OTHER')
    expect(iconsFor('Kids haircut')).toEqual(['KIDS', 'HAIRCUT', 'OTHER'])
    expect(iconOf({ name: 'बाल कटिंग' })).toBe('HAIRCUT')   // a name written in Devanagari
    expect(iconOf({ name: 'Spa pedicure' })).toBe('PEDICURE')
  })

  it('has a drawing for every picture', () => {
    for (const i of SERVICE_ICONS) expect(ICON_DRAWINGS[i].length, i).toBeGreaterThan(0)
  })
})
