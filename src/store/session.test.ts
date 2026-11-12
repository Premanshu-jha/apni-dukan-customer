import { forgetAfterEmail, nextAfterSignIn, rememberAfterEmail, rememberReturn, takeAfterEmail } from '../features/auth/flow'
import { missingSteps, needsEmail, signUpSteps } from './session'

const base = { id: 'u', phone: '9848012345', admin: false }

describe('missingSteps', () => {
  it('asks for email first and name last', () => {
    expect(missingSteps({ ...base, name: null, email: null, emailVerified: false })).toEqual(['email', 'name'])
  })
  it('counts an unverified email as missing', () => {
    expect(missingSteps({ ...base, name: 'Riya', email: 'r@x.in', emailVerified: false })).toEqual(['email'])
  })
  it('is empty once everything is done', () => {
    expect(missingSteps({ ...base, name: 'Riya', email: 'r@x.in', emailVerified: true })).toEqual([])
  })
})

describe('the email after sign-up', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  it('sign-up asks only for the name; the email waits', () => {
    expect(signUpSteps({ ...base, name: null, email: null, emailVerified: false })).toEqual(['name'])
    expect(signUpSteps({ ...base, name: 'Riya', email: null, emailVerified: false })).toEqual([])
    expect(needsEmail({ ...base, name: 'Riya', email: 'r@x.in', emailVerified: false })).toBe(true)
    expect(needsEmail({ ...base, name: 'Riya', email: 'r@x.in', emailVerified: true })).toBe(false)
    expect(needsEmail(null)).toBe(false)
  })
  it('after the phone code: the name if missing, else where they were going, never the email', () => {
    expect(nextAfterSignIn({ ...base, name: null, email: null, emailVerified: false })).toBe('/welcome/name')
    rememberReturn('/bookings')
    expect(nextAfterSignIn({ ...base, name: 'Riya', email: null, emailVerified: false })).toBe('/bookings')
  })
  it('after verifying: where they were going, once, only for the same person; else Home', () => {
    rememberAfterEmail('/salons/s1/book', 'u1')
    expect(takeAfterEmail('u1')).toBe('/salons/s1/book')
    expect(takeAfterEmail('u1')).toBe('/')
    rememberAfterEmail('/help', 'u1')
    expect(takeAfterEmail('u2')).toBe('/')   // someone else signed in on this phone
    rememberAfterEmail('/verify-email', 'u1')
    expect(takeAfterEmail('u1')).toBe('/')
    rememberAfterEmail('//evil.example', 'u1')
    expect(takeAfterEmail('u1')).toBe('/')
    rememberAfterEmail('/places/new', 'u1')
    forgetAfterEmail()   // Back on the email screen, or Verify now from Home
    expect(takeAfterEmail('u1')).toBe('/')
  })
})
