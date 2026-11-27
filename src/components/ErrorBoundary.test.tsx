import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Shell } from '../app/Shell'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('a screen failed to draw')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; keep the test output clean
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows "Something went wrong" instead of a blank page, and "Start again" goes Home', async () => {
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign })
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong on this screen')).toBeInTheDocument()
    expect(screen.getByText('Your bookings are safe. Start again to carry on.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }))
    expect(assign).toHaveBeenCalledWith('/')
  })

  it('offers a person if starting again ends here again: Call us and WhatsApp us, plain links outside any router', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Still stuck? Talk to us:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919381251613')
    const whatsApp = screen.getByRole('link', { name: 'WhatsApp us' })
    expect(decodeURIComponent(whatsApp.getAttribute('href')!)).toBe('https://wa.me/919381251613?text=Hi Clozest, I need help with: Something went wrong on this screen')
    // On the website a new tab keeps the app open
    expect(whatsApp).toHaveAttribute('target', '_blank')
  })

  it('around each screen: the bottom bar stays, and opening another screen clears it', async () => {
    render(
      <MemoryRouter initialEntries={['/bookings']}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<p>Home screen</p>} />
            <Route path="/bookings" element={<Broken />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Something went wrong on this screen')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /Home/ }))
    expect(screen.getByText('Home screen')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong on this screen')).not.toBeInTheDocument()
  })
})
