import { guideDone, markGuideDone } from './once'
import { RETURN_FOR_MS, isSalonLink, nextAfterSignIn, rememberReturn, returningToSalon } from '../auth/flow'
import type { User } from '../../api/types'

describe('one-time guide', () => {
  beforeEach(() => localStorage.clear())

  it('is remembered per account, and never shown with nobody signed in', () => {
    expect(guideDone('u1', 'howItWorks')).toBe(false)
    markGuideDone('u1', 'howItWorks')
    expect(guideDone('u1', 'howItWorks')).toBe(true)
    expect(guideDone('u2', 'howItWorks')).toBe(false)
    expect(guideDone('u1', 'hint.salon')).toBe(false)
    expect(guideDone(undefined, 'howItWorks')).toBe(true)
  })
})

describe('sign-in from a salon link', () => {
  beforeEach(() => localStorage.clear())

  it('knows when sign-in goes back to a salon page', () => {
    expect(returningToSalon()).toBe(false)
    rememberReturn('/salons/3f2a9c')
    expect(returningToSalon()).toBe(true)
    rememberReturn('/salons/3f2a9c/book')
    expect(returningToSalon()).toBe(true)
    rememberReturn('/bookings/b1')
    expect(returningToSalon()).toBe(false)
  })

  it('forgets where they were going after 30 minutes (a shared phone put down without signing in)', () => {
    const user = { id: 'u1', phone: '9848012345', name: 'Riya', email: null, emailVerified: false, admin: false } as User
    const now = vi.spyOn(Date, 'now')
    try {
      now.mockReturnValue(1_000_000)
      rememberReturn('/salons/3f2a9c')
      now.mockReturnValue(1_000_000 + RETURN_FOR_MS - 1000)
      expect(returningToSalon()).toBe(true)
      expect(nextAfterSignIn(user)).toBe('/salons/3f2a9c')
      now.mockReturnValue(1_000_000 + RETURN_FOR_MS + 1000)
      expect(returningToSalon()).toBe(false)
      expect(nextAfterSignIn(user)).toBe('/')
      expect(localStorage.getItem('ad.returnTo')).toBeNull()
      // A path kept by an older version (no time with it) is forgotten too
      localStorage.setItem('ad.returnTo', '/salons/3f2a9c')
      expect(nextAfterSignIn(user)).toBe('/')
    } finally {
      now.mockRestore()
    }
  })
})

describe('a salon link is always kept for after sign-in', () => {
  it('is the salon page only, not its booking steps or other screens', () => {
    expect(isSalonLink('/salons/3f2a9c')).toBe(true)
    expect(isSalonLink('/salons/3f2a9c/')).toBe(true)
    expect(isSalonLink('/salons/3f2a9c/book')).toBe(false)
    expect(isSalonLink('/salons/3f2a9c/confirm')).toBe(false)
    expect(isSalonLink('/salons')).toBe(false)
    expect(isSalonLink('/bookings/b1')).toBe(false)
  })
})
