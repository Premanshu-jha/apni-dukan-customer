import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Field, Page } from '../../components/ui'
import { looksLikeEmail } from '../../lib/phone'
import { useT } from '../../i18n'
import { useSession } from '../../store/session'
import { SUPPORT_EMAIL } from '../../lib/config'
import { cameFromBooking, forgetAfterEmail, takeAfterEmail } from './flow'

/**
 * /verify-email: an email we can reach, for support replies and for getting the account back if the phone is lost.
 * Not part of sign-up any more: Home's banner opens it, and so does the first thing the person does that needs it
 * (booking, saving a place, changing the profile, asking for help). Once verified it goes on to where they were
 * going (the booking they started, still filled in); Back leaves it for later.
 */
export function EmailStep() {
  const t = useT()
  const navigate = useNavigate()
  // Nothing in this app to go back to (opened from a link, a reload, the installed app's start): Back goes Home
  const first = ((window.history.state as { idx?: number } | null)?.idx ?? 0) === 0
  const userId = useSession((s) => s.user?.id)
  const setUser = useSession((s) => s.setUser)
  const current = useSession((s) => s.user?.email) ?? ''
  const [email, setEmail] = useState(current)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  // Sent here by Pick a time / Confirm: say why the booking stopped, and that it carries on after
  const [forBooking] = useState(() => cameFromBooking(userId))

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    if (busy) return
    const address = email.trim()
    if (!looksLikeEmail(address)) {
      setError(t('auth.emailInvalid'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await authApi.sendEmailCode(address)
      setSentTo(address)
      setCode('')
      setWait(30)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify(value: string) {
    if (!sentTo || value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      const user = await authApi.verifyEmail(sentTo, value)
      setUser(user)
      navigate(takeAfterEmail(userId), { replace: true, state: { emailVerified: true } })
    } catch (err) {
      setError(messageOf(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title={t('auth.emailTitle')} back={first ? '/' : true} onBack={forgetAfterEmail}>
      {forBooking ? (
        <Banner tone="info">
          <span className="font-semibold">{t('auth.emailForBookingLead')}</span> {t('auth.emailForBookingBody')}
        </Banner>
      ) : (
        <p className="text-muted">
          {t('auth.emailIntro')}
        </p>
      )}
      {!sentTo ? (
        <form onSubmit={send} className="flex flex-col gap-4" noValidate>
          <Field
            id="email"
            label={t('auth.emailLabel')}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button type="submit" busy={busy} disabled={!looksLikeEmail(email)}>
            {t('auth.sendCode')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            {t('auth.emailSentBefore')}
            <span className="text-ink [overflow-wrap:anywhere]">{sentTo}</span>
            {t('auth.emailSentAfter')}
          </p>
          <CodeInput
            id="email-code"
            label={t('auth.codeLabel')}
            value={code}
            onChange={(v) => {
              setCode(v)
              if (v.length === 6) void verify(v)
            }}
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} disabled={code.length !== 6} onClick={() => verify(code)}>
            {t('auth.verify')}
          </Button>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => send()} disabled={busy || wait > 0}>
              {wait > 0 ? t('auth.emailSendAgainIn', { seconds: wait }) : t('auth.emailSendAgain')}
            </Button>
            <Button variant="ghost" onClick={() => setSentTo(null)}>
              {t('auth.emailChange')}
            </Button>
          </div>
          <p className="text-center text-sm text-muted">
            {t('auth.emailNoCode')}{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      )}
    </Page>
  )
}
