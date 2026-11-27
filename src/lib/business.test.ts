import { CALL_LINK, whatsAppLink } from './business'

describe('reaching support', () => {
  it('calls the support number, digits only', () => {
    expect(CALL_LINK).toBe('tel:+919381251613')
  })

  it('opens WhatsApp with the first words typed, safely encoded', () => {
    expect(whatsAppLink('Hi Clozest, I need help with: My booking & code?')).toBe(
      'https://wa.me/919381251613?text=Hi%20Clozest%2C%20I%20need%20help%20with%3A%20My%20booking%20%26%20code%3F',
    )
  })
})
