import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { useSession } from '../../store/session'
import { cleanedLength, sendError } from './text'
import { helpApi, helpKeys } from '../../api/help'
import { useQueryClient } from '@tanstack/react-query'
import { isApiError, messageOf } from '../../api/errors'
import type { HelpTicket } from '../../api/types'
import { Banner, Button, Field, Page } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'
import { storage } from '../../lib/storage'
import { rememberAfterEmail } from '../auth/flow'

/** The backend's limits (TicketService): a message of 10 to 5,000 characters, a subject of at most 100. */
const MESSAGE_MIN = 10
const MESSAGE_MAX = 5000
const SUBJECT_MAX = 100
/** What this person typed, kept until it's sent, so leaving or a failed send never loses it (never shown to another). */
const draftKey = (userId: string) => `ad.helpDraft.${userId}`

/**
 * /help: "Need help" — the customer writes to support; it becomes a ticket (CLZ-1042) and our reply comes by email.
 * Opened from Profile and from "Let us know" when no salon is near (`?about=` fills the subject, `?text=` the
 * message). Behind EmailVerifiedOnly: the reply needs a verified email.
 */
export function NeedHelp() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const location = useLocation()
  const [params] = useSearchParams()
  const user = useSession((s) => s.user)!
  const setUser = useSession((s) => s.setUser)
  const DRAFT_KEY = draftKey(user.id)
  // A link that says what it's about ("Let us know", a booking) wins over an older, different draft (the same one,
  // back from a detour, stays)
  const draft = storage.getJson<{ subject: string; message: string }>(DRAFT_KEY)
  const saved = !params.has('about') || draft?.subject === params.get('about') ? draft : null
  const [subject, setSubject] = useState(saved?.subject || params.get('about') || '')
  const [message, setMessage] = useState(saved?.message || params.get('text') || '')
  const heading = useRef<HTMLHeadingElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<HelpTicket | null>(null)
  const sending = useRef(false)

  useEffect(() => {
    if (done) return
    if (subject.trim() || message.trim()) storage.setJson(DRAFT_KEY, { subject, message })
    else storage.remove(DRAFT_KEY)
  }, [subject, message, done, DRAFT_KEY])

  useEffect(() => {
    if (done) heading.current?.focus()   // the form is gone: screen readers hear the ticket number
  }, [done])

  const length = cleanedLength(message)
  const problem =
    length > 0 && length < MESSAGE_MIN
      ? `Tell us a little more (at least ${MESSAGE_MIN} characters).`
      : length > MESSAGE_MAX
        ? `At most ${MESSAGE_MAX} characters (now ${length}).`
        : null

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending.current || length < MESSAGE_MIN || length > MESSAGE_MAX) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const ticket = await helpApi.ask(message.trim(), subject)
      storage.remove(DRAFT_KEY)
      void qc.invalidateQueries({ queryKey: helpKeys.mine })   // My requests shows it at once
      setDone(ticket)
    } catch (err) {
      if (isApiError(err, 'PROFILE_INCOMPLETE')) {
        // The email stopped being verified meanwhile (changed on another device): read the profile again, verify,
        // then back here (what was typed is kept)
        void authApi.me().then(setUser).catch(() => {})
        const missing = (err.details.missing as string[] | undefined) ?? []
        if (missing.includes('email')) {
          rememberAfterEmail(location.pathname + location.search, user.id)
          navigate('/verify-email')
          return
        }
      }
      setError(isApiError(err, 'VALIDATION_FAILED') ? sendError(err.details, messageOf(err)) : messageOf(err))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Page title="Need help" back="/">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          Sent: ticket {done.number}
        </h2>
        <Banner tone="good">
          We've got it: ticket <strong>{done.number}</strong>. Our support team will reply to{' '}
          <span className="[overflow-wrap:anywhere]">{done.sentTo}</span> as soon as we can.
        </Banner>
        <p className="text-sm text-muted">
          We've emailed you a copy. To add anything, open it in My requests, or reply to that email (keep{' '}
          {done.number} in the subject).
        </p>
        <Button
          onClick={() => {
            // Need help → My requests → the request: ← goes to the list, and its ← home (Need help is done)
            navigate('/help/requests', { replace: true })
            navigate(`/help/requests/${done.id}`, { state: { fromList: true } })
          }}
        >
          See it in My requests
        </Button>
        <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
          Back to Home
        </Button>
      </Page>
    )
  }

  return (
    <Page title="Need help" back>
      <Link to="/help/requests" state={{ from: true }} className="self-start text-sm text-link underline">
        Asked before? See My requests and our replies
      </Link>
      <p className="text-muted">
        Tell us what happened. For a booking, add its number (like SB7K3Q9X). We reply by email.
      </p>
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        <Field
          id="help-subject"
          label="What's it about? (optional)"
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="My booking, an offer, my account…"
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="help-message" className="text-sm font-medium text-muted">
            Your message
          </label>
          <textarea
            id="help-message"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={problem ? true : undefined}
            aria-describedby="help-message-hint"
            className={`rounded-xl border bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none ${problem ? 'border-bad' : 'border-line'}`}
          />
          <p id="help-message-hint" className={`text-sm ${problem ? 'text-bad' : 'text-muted'}`}>
            {problem ?? (length === 0 ? `At least ${MESSAGE_MIN} characters` : `${length} / ${MESSAGE_MAX}`)}
          </p>
        </div>
        {error && <Banner tone="bad">{error} What you wrote is kept here.</Banner>}
        <Button type="submit" busy={busy} disabled={length < MESSAGE_MIN || length > MESSAGE_MAX}>
          Send to support
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Or email us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </Page>
  )
}
