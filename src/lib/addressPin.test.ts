import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../api/errors'
import { addressProblems, addressSearchOff, canSearchAddress, fillEmpty, insideIndia, metresBetween, precisionHint, resetAddressSearch, round6, searchFailure, zoomFor } from './addressPin'

const address = { addressLine: 'Shop 12, Ithum Tower', area: 'Sector 62', city: 'Noida', pincode: '201309' }

describe('Find on map (a saved place)', () => {
  beforeEach(() => resetAddressSearch())

  it('needs the address, area, city and a 6-digit pincode, as the backend checks them', () => {
    expect(canSearchAddress(address)).toBe(true)
    expect(canSearchAddress({ ...address, addressLine: '4' })).toBe(false)
    expect(canSearchAddress({ ...address, addressLine: '4B' })).toBe(true)
    expect(canSearchAddress({ ...address, area: ' ' })).toBe(false)
    expect(canSearchAddress({ ...address, city: 'N' })).toBe(false)
    expect(canSearchAddress({ ...address, pincode: '01309' })).toBe(false)
    expect(canSearchAddress({ ...address, pincode: '20130' })).toBe(false)
    expect(canSearchAddress({ ...address, pincode: ' 201309 ' })).toBe(true)
  })

  it('tells the customer to check an exact pin and to drag a rough one', () => {
    expect(precisionHint('EXACT')).toBe('Check the pin is on your building.')
    expect(precisionHint('STREET')).toBe("This is only close by. Drag the pin onto your building.")
    expect(precisionHint('AREA')).toBe("This is only close by. Drag the pin onto your building.")
  })

  it('hides the button for the visit when the backend has it turned off', () => {
    expect(addressSearchOff()).toBe(false)
    expect(searchFailure(new ApiError(503, { code: 'GEOCODING_OFF', message: 'x' }))).toEqual({ hide: true })
    expect(addressSearchOff()).toBe(true)
  })

  it('says what went wrong in plain words', () => {
    expect(searchFailure(new ApiError(404, { code: 'ADDRESS_NOT_FOUND', message: 'x' }))).toEqual({
      hide: false,
      text: "Couldn't find that address. Check the pincode and area, or use your current location.",
    })
    expect(searchFailure(new ApiError(429, { code: 'TRY_LATER', message: 'x' }, 61))).toEqual({
      hide: false,
      text: 'Many address searches in a short time. Try again in 2 minutes, or use your current location.',
    })
    expect(searchFailure(new ApiError(429, { code: 'TRY_LATER', message: 'x' }, 30))).toEqual({
      hide: false,
      text: 'Many address searches in a short time. Try again in 1 minute, or use your current location.',
    })
    const down = "Address search isn't working right now. Use your current location, or try again later."
    expect(searchFailure(new ApiError(503, { code: 'GEOCODING_UNAVAILABLE', message: 'x' }))).toEqual({ hide: false, text: down })
    expect(searchFailure(ApiError.network())).toEqual({ hide: false, text: down })
    expect(searchFailure(new Error('boom'))).toEqual({ hide: false, text: down })
    expect(addressSearchOff()).toBe(false)
  })

  it('asks to check the fields when the backend still refuses them', () => {
    const refused = new ApiError(400, { code: 'VALIDATION_FAILED', message: 'x', details: { pincode: 'must be a 6-digit pincode' } })
    expect(searchFailure(refused)).toEqual({
      hide: false,
      text: 'Check the address, area, city and pincode above, then try again.',
    })
  })

  it('starts the map closer the more exact the pin is', () => {
    expect(zoomFor('EXACT')).toBe(18)
    expect(zoomFor('STREET')).toBe(17)
    expect(zoomFor('AREA')).toBe(15)
  })
})

describe('filling the address from the GPS point', () => {
  const at = { addressLine: 'Ithum Tower, Sector 62 Road', area: 'Sector 62', city: 'Noida', pincode: '201309', formattedAddress: 'x' }
  const blank = { name: 'Shine', addressLine: '', area: '', city: '', pincode: '' }

  it('fills every empty address field and nothing else', () => {
    expect(fillEmpty(blank, at)).toEqual({ name: 'Shine', addressLine: 'Ithum Tower, Sector 62 Road', area: 'Sector 62', city: 'Noida', pincode: '201309' })
  })

  it('never overwrites what the customer typed', () => {
    const typed = { ...blank, addressLine: 'Shop 12', city: 'Delhi' }
    expect(fillEmpty(typed, at)).toEqual({ ...typed, area: 'Sector 62', pincode: '201309' })
  })

  it('leaves out what Google didn’t give, or a pincode that isn’t one, and says when nothing changed', () => {
    expect(fillEmpty(blank, { ...at, addressLine: '', pincode: '5000' })).toEqual({ ...blank, area: 'Sector 62', city: 'Noida' })
    const full = { ...blank, addressLine: 'a', area: 'b', city: 'c', pincode: '110001' }
    expect(fillEmpty(full, at)).toBe(full)
    expect(fillEmpty({ ...blank, area: '  ' }, { ...at, area: '' }).area).toBe('  ')
  })
})

describe('the address and the pin, as the backend checks them', () => {
  it('names each field that is missing, the way the form shows it', () => {
    expect(addressProblems({ addressLine: ' ', area: 'K', city: '', pincode: '12345' })).toEqual({
      addressLine: 'Enter your house or flat number and street.',
      area: 'Enter the area.',
      city: 'Enter the city.',
      pincode: 'Enter the 6-digit pincode.',
    })
    expect(addressProblems({ addressLine: '4B', area: 'Kondapur', city: 'Hyderabad', pincode: '500084' })).toEqual({})
  })

  it('takes India only, six decimals, and measures how far the pin moved', () => {
    expect(insideIndia(17.46, 78.36)).toBe(true)
    expect(insideIndia(51.5, -0.12)).toBe(false)
    expect(insideIndia(5.99, 78)).toBe(false)
    expect(round6(17.4651234)).toBe(17.465123)
    expect(metresBetween({ lat: 17.4651, lng: 78.3644 }, { lat: 17.4651, lng: 78.3644 })).toBe(0)
    expect(metresBetween({ lat: 17.4651, lng: 78.3644 }, { lat: 17.4660, lng: 78.3644 })).toBe(100)
  })
})
