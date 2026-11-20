import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { useSession } from '../../store/session'
import { AttachmentPicker, useAttachments } from './Attach'
import { cleanedLength, sendError } from './text'
import { helpApi, helpKeys } from '../../api/help'
import { useQueryClient } from '@tanstack/react-query'
import { isApiError, messageOf } from '../../api/errors'
import type { HelpTicket } from '../../api/types'
import { Banner, Button, Field, Page } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'
import { storage } from '../../lib/storage'
import { rememberAfterEmail } from '../auth/flow'
import { useT } from '../../i18n'

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
/** Set when leaving for the email check with files picked (they can't come along). */
const FILES_DROPPED = 'ad.helpFilesDropped'

export function NeedHelp() {
  const t = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const location = useLocation()
  const [params] = useSearchParams()
  const user = useSession((s) => s.user)!
  const setUser = useSession((s) => s.setUser)
  const DRAFT_KEY = draftKey(user.id)
  const files = useAttachments()
  // A link that says what it's about ("Let us know", a booking) wins over an older, different draft (the same one,
  // back from a detour, stays)
  const draft = storage.getJson<{ subject: string; message: string }>(DRAFT_KEY)
  const saved = !params.has('about') || draft?.subject === params.get('about') ? draft : null
  const [subject, setSubject] = useState(saved?.subject || params.get('about') || '')
  const [message, setMessage] = useState(saved?.message || params.get('text') || '')
  const heading = useRef<HTMLHeadingElement | null>(null)
  const [busy, setBusy] = useState(false)
  // Back from verifying the email: the words were kept, the files couldn't be (they go with the page)
  const [error, setError] = useState<string | null>(() => {
    try {
      if (sessionStorage.getItem(FILES_DROPPED) !== null) {
        sessionStorage.removeItem(FILES_DROPPED)
        return t('help.filesDropped')
      }
    } catch {
      /* storage blocked: nothing to say */
    }
    return null
  })
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
      ? t('help.tooShort', { min: String(MESSAGE_MIN) })
      : length > MESSAGE_MAX
        ? t('help.tooLong', { max: String(MESSAGE_MAX), length: String(length) })
        : null

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending.current || length < MESSAGE_MIN || length > MESSAGE_MAX || files.sending || files.failed) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const ticket = await helpApi.ask(message.trim(), subject, files.fileIds)
      storage.remove(DRAFT_KEY)
      files.clear()
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
          if (files.items.length > 0) {
            try {
              sessionStorage.setItem(FILES_DROPPED, '1')
            } catch {
              /* storage blocked */
            }
          }
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
      <Page title={t('help.needHelpTitle')} back="/">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {t('help.sentTicket', { number: done.number })}
        </h2>
        <Banner tone="good">
          {t('help.gotItBefore')} <strong>{done.number}</strong>{t('help.gotItMiddle')}{' '}
          <span className="[overflow-wrap:anywhere]">{done.sentTo}</span> {t('help.gotItAfter')}
        </Banner>
        <p className="text-sm text-muted">
          {t('help.emailedCopy', { number: done.number })}
        </p>
        <Button
          onClick={() => {
            // Need help → My requests → the request: ← goes to the list, and its ← home (Need help is done)
            navigate('/help/requests', { replace: true })
            navigate(`/help/requests/${done.id}`, { state: { fromList: true } })
          }}
        >
          {t('help.seeInMyRequests')}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
          {t('help.backToHome')}
        </Button>
      </Page>
    )
  }

  return (
    <Page title={t('help.needHelpTitle')} back>
      <Link to="/help/requests" state={{ from: true }} className="self-start text-sm text-link underline">
        {t('help.askedBefore')}
      </Link>
      <p className="text-muted">
        {t('help.intro')}
      </p>
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        <Field
          id="help-subject"
          label={t('help.subjectLabel')}
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t('help.subjectPlaceholder')}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="help-message" className="text-sm font-medium text-muted">
            {t('help.messageLabel')}
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
            {problem ?? (length === 0 ? t(files.items.length > 0 ? 'help.atLeastWithFile' : 'help.atLeast', { min: String(MESSAGE_MIN) }) : t('help.counter', { length: String(length), max: String(MESSAGE_MAX) }))}
          </p>
        </div>
        <AttachmentPicker a={files} id="help-files" disabled={busy} />
        {files.sending && <p className="text-sm text-muted">{t('help.filesUploading')}</p>}
        {files.failed && <p className="text-sm text-bad">{t('help.fileFailed')}</p>}
        {error && <Banner tone="bad">{t('help.errorKept', { reason: error })}</Banner>}
        <Button type="submit" busy={busy} disabled={length < MESSAGE_MIN || length > MESSAGE_MAX || files.sending || files.failed}>
          {t('help.sendToSupport')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        {t('help.orEmailUsAt')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </Page>
  )
}
