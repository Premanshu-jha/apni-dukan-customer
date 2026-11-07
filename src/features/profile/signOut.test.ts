import { QueryClient } from '@tanstack/react-query'
import { closeShownNotifications } from '../../api/push'
import { useSession } from '../../store/session'
import { signOutHere } from './signOut'

vi.mock('../../api/auth', () => ({ authApi: { logout: vi.fn(async () => undefined), logoutAll: vi.fn(async () => undefined) } }))

/** A phone with two booking messages still in its tray. */
function trayWith(count: number) {
  const shown = Array.from({ length: count }, () => ({ close: vi.fn() }))
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ getNotifications: async () => shown }) },
  })
  return shown
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('signing out on a shared phone', () => {
  it('closes the notifications already shown', async () => {
    const shown = trayWith(2)
    useSession.setState({ status: 'signedIn', refreshToken: 'r1', accessToken: 'a1' })
    await signOutHere(new QueryClient())
    await vi.waitFor(() => shown.forEach((n) => expect(n.close).toHaveBeenCalled()))
    expect(useSession.getState().status).toBe('signedOut')
  })

  it('never throws where there is no service worker', async () => {
    await expect(closeShownNotifications()).resolves.toBeUndefined()
  })
})
