import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { needsEmail, useSession } from '../../store/session'
import { HowToList } from './HowToList'
import { hasUnreadReply, repliedCount } from './replied'
import { AttachmentPicker, useAttachments } from './Attach'
import { cleanedLength, sendError } from './text'
import { helpApi, helpKeys, useMyRequestsGlance } from '../../api/help'
import { useQueryClient } from '@tanstack/react-query'
import { isApiError, messageOf } from '../../api/errors'
import type { HelpTicket, MyRequest } from '../../api/types'
import { Banner, Button, Field, Page } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'
import { storage } from '../../lib/storage'
import { rememberAfterEmail } from '../auth/flow'
import { CallUs } from './CallUs'
import { useT } from '../../i18n'

/** The backend's limits (TicketService): a message of 10 to 5,000 characters, a subject of at most 100. */
const MESSAGE_MIN = 10
const MESSAGE_MAX = 5000
const SUBJECT_MAX = 100
/** What this person typed, kept until it's sent, so leaving or a failed send never loses it (never shown to another). */
const draftKey = (userId: string) => `ad.helpDraft.${userId}`

/**
 * /help: "Need help" — first "Write to us" (the customer writes to support; it becomes a ticket (CLZ-1042) and our
 * reply comes by email), then My requests with what is new there, then short answers to look up ("How do I…?").
 * Opened from every screen's Help button, from Profile and from "Let us know" when no salon is near (`?about=` fills
 * the subject, `?text=` the message). `keep=1` (the Help buttons, an error's "Write to us"): they only fill what is
 * still empty, so a draft typed earlier is never replaced. The answers are open to everyone signed in; writing needs
 * a verified email (the reply goes there): with it pending, Write to us (or a link that opens the form) says so on
 * this page, with one tap to verify and come back with the form open (`write=1`); it never sends anyone to the email
 * screen on its own, so someone stuck on that screen is not sent back to it. "Call us" and "WhatsApp us" are always
 * under Write to us, for everyone, email or not.
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
  // keep=1 (a Help button): a draft with a message always stays, the link only fills what it left empty (a subject
  // alone, with nothing written under it, is most likely the last Help button's and gives way to this one's)
  const keep = params.get('keep') === '1'
  const saved = keep
    ? draft?.message.trim() ? draft : null
    : !params.has('about') || draft?.subject === params.get('about') ? draft : null
  const [subject, setSubject] = useState(saved?.subject || params.get('about') || '')
  const [message, setMessage] = useState(saved?.message || params.get('text') || '')
  const hasDraft = Boolean(saved && (saved.subject.trim() || saved.message.trim()))
  // The form shows at once for a link that asks to write (a message to send, "Let us know") or a draft to finish;
  // a Help button's subject alone waits for Write to us, so the answers below are seen first
  const asksToWrite = params.get('write') === '1' || params.has('text') || (params.has('about') && !keep)
  const emailPending = needsEmail(user)
  const [writing, setWriting] = useState(!emailPending && (asksToWrite || hasDraft))
  /** Write to us tapped (or a link asked for the form) with the email pending: what writing needs, said here. */
  const [emailAsk, setEmailAsk] = useState(emailPending && asksToWrite)
  const requests = useMyRequestsGlance(!emailPending)
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
  // Opened by tapping Write to us (not on arrival): the form's first box gets the focus
  const focusForm = useRef(false)
  useEffect(() => {
    if (writing && focusForm.current) {
      focusForm.current = false
      const box = document.getElementById('help-subject')
      box?.focus()
      box?.scrollIntoView({ block: 'center' })
    }
  }, [writing])

  /** Write to us (or an answer's "Tell us"): the form, starting with this subject if none was typed yet. */
  function startWriting(about?: string) {
    if (emailPending) {
      // The reply needs a verified email: said here first (the person chooses to verify, or calls us instead)
      if (about && !subject.trim()) setSubject(about)
      setEmailAsk(true)
      requestAnimationFrame(() => document.getElementById('help-email-needed')?.focus())
      return
    }
    if (about && !subject.trim()) setSubject(about)
    focusForm.current = true
    setWriting(true)
  }

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
          // Said here, as for Write to us (what was typed stays in the draft; Verify my email goes and comes back)
          setWriting(false)
          setEmailAsk(true)
          requestAnimationFrame(() => document.getElementById('help-email-needed')?.focus())
          return
        }
      }
      setError(isApiError(err, 'VALIDATION_FAILED') ? sendError(err.details, messageOf(err)) : messageOf(err))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  /**
   * Verify the email to write: there and back, with the form open. What is typed comes back from the draft kept on
   * this phone (never put in the address, where the history would keep it).
   */
  function verifyToWrite() {
    const next = new URLSearchParams(params)
    next.set('write', '1')
    next.delete('keep')
    // As typed (the draft keeps it untrimmed, and comes back only for the same subject)
    if (subject.trim()) next.set('about', subject)
    else next.delete('about')
    rememberAfterEmail(`${location.pathname}?${next}`, user.id)
    if (files.items.length > 0) {
      try {
        sessionStorage.setItem(FILES_DROPPED, '1')
      } catch {
        /* storage blocked */
      }
    }
    navigate('/verify-email')
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
        <p className="text-sm text-muted">{t('help.replyShowsHere')}</p>
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
      {!writing && !emailAsk && (
        <Button className="min-h-14 w-full text-lg" onClick={() => startWriting()}>
          <WriteIcon />
          {t('help.writeToUs')}
        </Button>
      )}
      {emailAsk && (
        <section aria-labelledby="help-email-needed" className="flex flex-col gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-4">
          <h2 id="help-email-needed" tabIndex={-1} className="font-display text-lg font-semibold outline-none">
            {t('help.emailNeededTitle')}
          </h2>
          <p className="text-sm">{t('help.emailNeededBody')}</p>
          <Button onClick={verifyToWrite}>{t('help.verifyToWrite')}</Button>
          <p className="text-sm text-muted">{t('help.emailNeededOr')}</p>
        </section>
      )}
      {/* A person, one tap away, for everyone: no email, no typing */}
      {!writing && <CallUs about={subject.trim() || undefined} />}
      {writing && (
      <>
      <h2 className="font-display text-lg font-semibold">{t('help.writeToUs')}</h2>
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
      <p className="text-sm text-muted">{t('help.ratherTalk')}</p>
      <CallUs about={subject.trim() || undefined} />
      </>
      )}
      {!emailPending && <RequestsCard userId={user.id} list={requests.data} />}
      <HowToList onWrite={startWriting} />
      <p className="text-center text-sm text-muted">
        {t('help.orEmailUsAt')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </Page>
  )
}

function WriteIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4 3v-3H5.5A1.5 1.5 0 0 1 4 15.5z" />
    </svg>
  )
}

/** My requests, with what is new there: our replies not opened yet, and those still with our support team. */
function RequestsCard({ userId, list }: { userId: string; list: MyRequest[] | undefined }) {
  const t = useT()
  const replied = repliedCount(userId, list)
  const open = (list ?? []).filter((r) => r.status === 'OPEN').length
  const unread = hasUnreadReply(userId, list)
  const parts = [
    replied > 0 ? t('help.requestsReplied', { count: replied }) : null,
    open > 0 ? t('help.requestsOpen', { count: open }) : null,
  ].filter(Boolean)
  return (
    <Link
      to="/help/requests"
      state={{ from: true }}
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:bg-raised"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-semibold">
          {t('help.myRequestsTitle')}
          {unread && <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />}
        </span>
        <span className="block text-sm text-muted">{parts.length ? parts.join(' · ') : t('help.requestsNone')}</span>
      </span>
      <span aria-hidden className="text-link">→</span>
    </Link>
  )
}
