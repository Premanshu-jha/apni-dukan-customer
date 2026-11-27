import type { MyRequest } from '../../api/types'
import { HOWTOS, searchHowTos } from './howto'
import { isHelpScreen, screenSubject } from './helpLink'
import { hasUnreadReply, markReplySeen, repliedCount } from './replied'
import { t } from '../../i18n'

const req = (over: Partial<MyRequest>): MyRequest => ({
  id: 't1', number: 'CLZ-1001', subject: null, status: 'WAITING',
  createdAt: '2026-11-20T10:00:00Z', lastMessageAt: '2026-11-20T11:00:00Z', ...over,
})

describe('the "support replied" dot', () => {
  beforeEach(() => localStorage.clear())

  it('shows for a reply not opened yet, goes once opened, comes back for a newer reply', () => {
    expect(hasUnreadReply('u1', [req({})])).toBe(true)
    markReplySeen('u1', 't1', '2026-11-20T11:00:00Z')
    expect(hasUnreadReply('u1', [req({})])).toBe(false)
    expect(hasUnreadReply('u1', [req({ lastMessageAt: '2026-11-21T09:00:00Z' })])).toBe(true)
  })

  it('never for requests with our team or resolved, nor for nothing read yet', () => {
    expect(hasUnreadReply('u1', [req({ status: 'OPEN' }), req({ id: 't2', status: 'RESOLVED' })])).toBe(false)
    expect(hasUnreadReply('u1', undefined)).toBe(false)
  })

  it('a list read before the reply was opened (older) does not bring the dot back', () => {
    markReplySeen('u1', 't1', '2026-11-20T12:00:00Z')
    expect(hasUnreadReply('u1', [req({})])).toBe(false)
  })

  it("follows support's latest message (lastReplyAt), whatever the status: a reply that resolved it shows too", () => {
    const resolved = req({ status: 'RESOLVED', lastReplyAt: '2026-11-20T11:00:00Z' })
    expect(hasUnreadReply('u1', [resolved])).toBe(true)
    expect(repliedCount('u1', [resolved])).toBe(1)
    markReplySeen('u1', 't1', '2026-11-20T11:00:00Z')
    expect(hasUnreadReply('u1', [resolved])).toBe(false)
    expect(repliedCount('u1', [resolved])).toBe(0)
    // Never replied: no dot, whatever the status; the person writing again isn't a reply
    expect(hasUnreadReply('u2', [req({ status: 'OPEN', lastReplyAt: null })])).toBe(false)
    markReplySeen('u3', 't1', '2026-11-20T11:00:00Z')
    expect(hasUnreadReply('u3', [req({ status: 'OPEN', lastMessageAt: '2026-11-21T09:00:00Z', lastReplyAt: '2026-11-20T11:00:00Z' })])).toBe(false)
  })

  it('counts the requests waiting on the person, and the unread replies of resolved ones', () => {
    expect(repliedCount('u1', [req({ lastReplyAt: '2026-11-20T11:00:00Z' }), req({ id: 't2', status: 'OPEN', lastReplyAt: null })])).toBe(1)
    expect(repliedCount('u1', undefined)).toBe(0)
  })

  it('is per account on a shared phone', () => {
    markReplySeen('u1', 't1', '2026-11-20T11:00:00Z')
    expect(hasUnreadReply('u2', [req({})])).toBe(true)
  })
})

describe('the how-to answers', () => {
  it('every answer has a question and an answer in English', () => {
    for (const h of HOWTOS) {
      expect(t(`howto.${h.id}Q`)).not.toBe(`howto.${h.id}Q`)
      expect(t(`howto.${h.id}A`)).not.toBe(`howto.${h.id}A`)
    }
  })

  it('search matches every word typed, in any case; nothing typed shows all', () => {
    expect(searchHowTos('', t)).toHaveLength(HOWTOS.length)
    expect(searchHowTos('FREE cancel', t).map((h) => h.id)).toContain('freeCancel')
    expect(searchHowTos('zzzz', t)).toEqual([])
  })

  it('the answers say the backend rules', () => {
    expect(t('howto.freeCancelA')).toContain('1 hour')
    expect(t('howto.freeCancelA')).toContain('10 minutes')
    expect(t('howto.missedA')).toContain('3 within 60 days stop online booking for 30 days')
    expect(t('howto.bookingA')).toContain('2 upcoming bookings')
  })
})

describe('Help button', () => {
  it('is not on the help screens', () => {
    expect(isHelpScreen('/help')).toBe(true)
    expect(isHelpScreen('/help/requests/t1')).toBe(true)
    expect(isHelpScreen('/contact')).toBe(true)
    expect(isHelpScreen('/helpful')).toBe(false)
    expect(isHelpScreen('/profile')).toBe(false)
  })

  it('names the screen it was opened from', () => {
    expect(screenSubject('/places/new', t)).toBe('Saved addresses')
    expect(screenSubject('/profile/phone', t)).toBe('Changing my mobile number')
    expect(screenSubject('/', t)).toBe('Finding a salon')
    expect(screenSubject('/salons/s1', t)).toBeUndefined()
  })
})

describe('hidden search words', () => {
  it('"OTP" finds the SMS-code answer without the word being shown in it', () => {
    expect(searchHowTos('OTP', t).map((h) => h.id)).toEqual(['smsCode'])
    expect(t('howto.smsCodeA')).not.toContain('OTP')
    expect(searchHowTos('zzzz', t)).toEqual([])
  })
})
