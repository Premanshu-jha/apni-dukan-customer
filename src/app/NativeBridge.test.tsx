import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { openInApp } from '../lib/appEvents'
import { NativeBridge } from './NativeBridge'

const bridge = vi.hoisted(() => ({
  app: true,
  back: null as null | ((e: { canGoBack: boolean }) => void),
  minimize: vi.fn(async () => {}),
}))

vi.mock('../lib/platform', () => ({ isApp: () => bridge.app }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (name: string, fn: (e: { canGoBack: boolean }) => void) => {
      if (name === 'backButton') bridge.back = fn
      return { remove: async () => void (bridge.back = null) }
    },
    minimizeApp: bridge.minimize,
  },
}))

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function show(start = '/bookings') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <NativeBridge />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  bridge.app = true
  bridge.back = null
  bridge.minimize.mockClear()
})

describe('the Play Store app’s bridge to the router', () => {
  it('opens the screen a tapped notification asked for, also one asked before it was drawn', async () => {
    openInApp('/bookings/b1')
    show()
    expect(await screen.findByText('/bookings/b1')).toBeInTheDocument()
    openInApp('/places')
    expect(await screen.findByText('/places')).toBeInTheDocument()
  })

  it('Back closes an open sheet first, else goes back, else puts the app in the background', async () => {
    show()
    await vi.waitFor(() => expect(bridge.back).not.toBeNull())
    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-modal', 'true')
    document.body.append(sheet)
    const escape = vi.fn()
    document.addEventListener('keydown', escape)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    bridge.back!({ canGoBack: true })
    expect(escape).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }))
    expect(back).not.toHaveBeenCalled()
    sheet.remove()
    bridge.back!({ canGoBack: true })
    expect(back).toHaveBeenCalledTimes(1)
    bridge.back!({ canGoBack: false })
    expect(bridge.minimize).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', escape)
  })

  it('does nothing on the website', async () => {
    bridge.app = false
    openInApp('/bookings/b1')
    show()
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByTestId('where')).toHaveTextContent('/bookings')
    expect(bridge.back).toBeNull()
  })
})
