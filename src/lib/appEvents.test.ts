import { linkTarget, notificationTarget, onOpenRequest, openInApp, takePendingOpen } from './appEvents'

describe('the screen a tapped notification opens in the app (the service worker’s rule)', () => {
  it('opens the message’s own page of this app', () => {
    expect(notificationTarget('/bookings/b1')).toBe('/bookings/b1')
    expect(notificationTarget('/help/requests/T-1?x=1')).toBe('/help/requests/T-1?x=1')
  })

  it('another site, or nothing: My bookings', () => {
    expect(notificationTarget('https://evil.example/bookings/b1')).toBe('/bookings')
    expect(notificationTarget('//evil.example/x')).toBe('/bookings')
    expect(notificationTarget(null)).toBe('/bookings')
  })
})

describe('a link to the website opened in the app', () => {
  it('a salon’s shared link opens its page; another site, http or a look-alike host opens nothing', () => {
    expect(linkTarget('https://clozest.in/salons/shop1', 'clozest.in')).toBe('/salons/shop1')
    expect(linkTarget('https://evil.example/salons/shop1', 'clozest.in')).toBeNull()
    expect(linkTarget('http://clozest.in/salons/shop1', 'clozest.in')).toBeNull()
    expect(linkTarget('https://clozest.in.evil.example/', 'clozest.in')).toBeNull()
    expect(linkTarget('not a url', 'clozest.in')).toBeNull()
  })
})

describe('the screen waiting to open', () => {
  it('waits until taken (the router may not be drawn yet), once; the newest wins and listeners are told', () => {
    const told = vi.fn()
    const stop = onOpenRequest(told)
    openInApp('/bookings')
    openInApp('/salons/s1')
    expect(told).toHaveBeenCalledTimes(2)
    expect(takePendingOpen()).toBe('/salons/s1')
    expect(takePendingOpen()).toBeNull()
    stop()
    openInApp('/bookings/b1')
    expect(told).toHaveBeenCalledTimes(2)
    expect(takePendingOpen()).toBe('/bookings/b1')
  })
})
