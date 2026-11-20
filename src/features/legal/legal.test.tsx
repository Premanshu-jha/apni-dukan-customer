import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router'
import { resetLanguageForTests, setLanguage } from '../../i18n'
import { BUSINESS, OPERATED_BY } from '../../lib/business'
import { useSession } from '../../store/session'
import { About } from './About'
import { Contact } from './Contact'
import { Privacy } from './Privacy'
import { Terms } from './Terms'

function at(path: string, page: React.ReactNode) {
  render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>)
}

const words = (lang: string, area: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `src/i18n/${lang}/${area}.json`), 'utf8')) as Record<string, string>

describe('public pages', () => {
  beforeEach(() => useSession.setState({ status: 'signedOut', user: null }))
  afterEach(() => {
    resetLanguageForTests()
    window.localStorage.clear()
  })

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
    expect(screen.getByText('Last updated: 15 November 2026')).toBeInTheDocument()
  })

  it('About in Hindi: picked on the page (under the logo, kept as the phone\'s choice), every text in Hindi, the figures unchanged', async () => {
    const hi = words('hi', 'legal')
    at('/about', <About />)
    const picker = screen.getByRole('group', { name: 'Choose your language' })
    // Under the logo and the tagline, before everything else
    expect(screen.getByText('Near You. For You.').compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'हिन्दी' }))
    expect(await screen.findByRole('heading', { level: 1, name: hi.aboutTitle })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'हिन्दी' })).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('language')).toBe('hi')
    // The search radius: the same figure, in the Hindi sentence
    expect(screen.getByText(hi.aboutFind.replace('{km}', '2'))).toBeInTheDocument()
    expect(screen.getByText(hi.aboutFreeBold)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: hi.signInOrUp })).toHaveAttribute('href', '/signin')
    expect(screen.getByRole('link', { name: hi.aboutOwnSalonLink })).toHaveAttribute('href', 'https://partner.clozest.in')
    // Nothing of the English page is left, but the tagline and who runs Clozest stay in English; still no price
    expect(document.body.textContent).not.toMatch(/For customers|Booking is free|Questions\?|Own a salon\?|Sign in or sign up|₹/)
    expect(screen.getByText('Near You. For You.')).toBeInTheDocument()
    expect(screen.getByText(OPERATED_BY)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: hi.linksLabel })).toBeInTheDocument()
  })

  it('About offers the languages only to someone signed out (signed in, it is under Profile)', () => {
    useSession.setState({ status: 'signedIn' })
    at('/about', <About />)
    expect(screen.queryByRole('group', { name: 'Choose your language' })).toBeNull()
  })

  it('Contact in Telugu: the words translated, the email, phone and address as they are', async () => {
    const te = words('te', 'legal')
    await act(async () => {
      await setLanguage('te')
    })
    at('/contact', <Contact />)
    expect(screen.getByRole('heading', { level: 1, name: te.contactTitle })).toBeInTheDocument()
    expect(screen.getByText(te.contactPhone)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: BUSINESS.phone })).toHaveAttribute('href', 'tel:+919381251613')
    expect(screen.getAllByRole('link', { name: BUSINESS.email })[0]).toHaveAttribute('href', `mailto:${BUSINESS.email}`)
    expect(screen.getByText(new RegExp(BUSINESS.address))).toBeInTheDocument()
    expect(screen.getByText(`${words('te', 'app').tabProfile} → ${words('te', 'help').writeToSupport}`)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Write or call|Grievance officer|Signed in\?/)
  })

  it.each([
    ['/terms', <Terms key="t" />, 'termsTitle', 'Bookings (customers)'],
    ['/privacy', <Privacy key="p" />, 'privacyTitle', 'What we collect'],
  ])('%s: the policy stays in English; in another language its title and links are translated and a line says the English applies', async (path, page, title, english) => {
    const en = words('en', 'legal')
    const { unmount } = render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>)
    expect(screen.queryByText(en.englishApplies)).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
    unmount()

    const ta = words('ta', 'legal')
    await act(async () => {
      await setLanguage('ta')
    })
    at(path, page)
    expect(screen.getByRole('heading', { level: 1, name: ta[title] })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(ta.englishApplies)
    const policy = screen.getByRole('heading', { level: 2, name: english })
    expect(policy.closest('[lang="en"]')).not.toBeNull()
    expect(screen.getByText(OPERATED_BY)).toHaveAttribute('lang', 'en')
    const nav = screen.getByRole('navigation', { name: ta.linksLabel })
    expect(nav).toHaveTextContent(ta.contact)
  })
})
