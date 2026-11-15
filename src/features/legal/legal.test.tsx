import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { BUSINESS, OPERATED_BY } from '../../lib/business'
import { useSession } from '../../store/session'
import { About } from './About'
import { Contact } from './Contact'
import { Privacy } from './Privacy'
import { Terms } from './Terms'

function at(path: string, page: React.ReactNode) {
  render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>)
}

describe('public pages', () => {
  beforeEach(() => useSession.setState({ status: 'signedOut', user: null }))

  it.each([
    ['/about', <About key="a" />, 'About Clozest'],
    ['/contact', <Contact key="c" />, 'Contact us'],
    ['/terms', <Terms key="t" />, 'Terms of service'],
    ['/privacy', <Privacy key="p" />, 'Privacy policy'],
  ])('%s says who runs Clozest and links to the other pages, itself not as a link', (path, page, title) => {
    at(path, page)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(OPERATED_BY)).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'About Clozest' })
    const links = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toHaveLength(3)
    expect(links).not.toContain(path)
    expect(nav.querySelector('[aria-current="page"]')).not.toBeNull()
  })

  it('About, the customers\' front page, says booking is free and never shows the salons\' price', () => {
    at('/about', <About />)
    expect(screen.getByText(/Booking is free for customers/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/₹|a month|subscription/i)
    expect(screen.getByRole('link', { name: 'Clozest for salons' })).toHaveAttribute('href', 'https://partner.clozest.in')
    // The logo heads the front page
    expect(screen.getByText('Clozest', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('Terms say what the app says about late arrival (may be marked a no-show)', () => {
    at('/terms', <Terms />)
    expect(screen.getByText(/the booking may be marked a no-show/)).toBeInTheDocument()
    expect(screen.getByText(/Too many late cancels or missed bookings can stop you booking for a while/)).toBeInTheDocument()
  })

  it('Contact gives an email, a phone to tap and the address', () => {
    at('/contact', <Contact />)
    expect(screen.getAllByRole('link', { name: BUSINESS.email })[0]).toHaveAttribute('href', `mailto:${BUSINESS.email}`)
    expect(screen.getByRole('link', { name: BUSINESS.phone })).toHaveAttribute('href', 'tel:+919381251613')
    expect(screen.getByText(new RegExp(BUSINESS.address))).toBeInTheDocument()
    // The full registered (Udyam) address, with its PIN code: Razorpay's website check wants a full address
    expect(BUSINESS.address).toMatch(/G-10, A Block, G\.K\. Habitat Royal, Yapral, Secunderabad, Hyderabad, Telangana 500094/)
  })

  it('About: signed out "Sign in or sign up"; signed in "Find a salon"; while the session is starting, no button', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/about']}><About /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Sign in or sign up' })).toHaveAttribute('href', '/signin')
    unmount()
    useSession.setState({ status: 'signedIn' })
    const second = render(<MemoryRouter initialEntries={['/about']}><About /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Find a salon' })).toHaveAttribute('href', '/')
    second.unmount()
    useSession.setState({ status: 'starting' })
    at('/about', <About />)
    expect(screen.queryByRole('link', { name: /Sign in or sign up|Find a salon/ })).toBeNull()
  })

  it('About says the real search radius', () => {
    at('/about', <About />)
    expect(screen.getByText(/Find salons within 2 km of you/)).toBeInTheDocument()
  })

  it('no customer page talks about paying Clozest: no price, no subscription, no refunds', () => {
    for (const [path, page] of [
      ['/about', <About key="a" />],
      ['/contact', <Contact key="c" />],
      ['/terms', <Terms key="t" />],
      ['/privacy', <Privacy key="p" />],
    ] as const) {
      const { unmount } = render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>)
      expect(document.body.textContent).not.toMatch(/₹|subscription|refund|Razorpay|a month|card|UPI|bank/i)
      unmount()
    }
  })

  it('the policies show when they were last changed', () => {
    at('/privacy', <Privacy />)
    expect(screen.getByText(`Last updated: ${BUSINESS.policiesUpdated}`)).toBeInTheDocument()
  })
})
