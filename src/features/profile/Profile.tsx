import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { fieldError, messageOf } from '../../api/errors'
import { Banner, Button, Card, Field, Page, Sheet } from '../../components/ui'
import { LANGUAGES, useLanguage, useT } from '../../i18n'
import { GlobeIcon, LanguagePicker } from '../../i18n/LanguagePicker'
import { formatPhone } from '../../lib/phone'
import { takePhoneChanged } from '../../lib/phoneMoved'
import { SUPPORT_EMAIL } from '../../lib/config'
import { LegalLinks } from '../legal/LegalPage'
import { CallUs } from '../help/CallUs'
import { needsEmail, useSession } from '../../store/session'
import { forgetAfterEmail, rememberAfterEmail } from '../auth/flow'
import { VerifyEmailBanner } from '../auth/VerifyEmailBanner'
import { NotificationsRow } from './Notifications'
import { SalonMessageSwitches } from './SalonMessageSwitches'
import { signOutHere } from './signOut'

export function Profile() {
  const t = useT()
  const lang = useLanguage()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [phoneChanged] = useState(takePhoneChanged)
  const user = useSession((s) => s.user)!
  const setUser = useSession((s) => s.setUser)
  // ?edit=name: back from verifying the email, carry on with what they tapped
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get('edit') === 'name' && !needsEmail(user))
  const [name, setName] = useState(user.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const emailPending = needsEmail(user)
  // Opened from an answer in Need help ("Take me there"): straight to that part (#messages, #language)
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  /** Changing the name needs a verified email first (as every other change): verify, then back here. */
  function startEditing() {
    if (emailPending) {
      rememberAfterEmail('/profile?edit=name', user.id)
      navigate('/verify-email')
      return
    }
    setEditing(true)
  }

  async function saveName() {
    setBusy(true)
    setError(null)
    try {
      setUser(await authApi.rename(name.trim()))
      setEditing(false)
    } catch (e) {
      setError(fieldError(e, 'name') ?? messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const [outError, setOutError] = useState<string | null>(null)

  async function out(everywhere: boolean) {
    setBusy(true)
    setOutError(null)
    try {
      await signOutHere(qc, { everywhere })
      navigate('/signin', { replace: true })
    } catch (e) {
      // Not signed out anywhere: say so, so nobody believes a lost phone is signed out
      setOutError(t('profile.signOutFailed', { reason: messageOf(e) }))
      setBusy(false)
    }
  }

  return (
    <Page title={t('profile.title')}>
      {/* The way to the language, first thing on Profile: found without reading (its name in its own script) */}
      <div className="-mb-2 flex justify-end">
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-link"
          onClick={() => {
            const card = document.getElementById('language')
            card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            card?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true })
          }}
        >
          <GlobeIcon />
          {t('language.button', { name: LANGUAGES.find((l) => l.code === lang)?.name ?? lang })}
        </button>
      </div>
      <VerifyEmailBanner />
      {phoneChanged && (
        <Banner tone="good">
          {t('profile.phoneChanged', { phone: formatPhone(phoneChanged) })}
        </Banner>
      )}
      {/* Help first: someone stuck shouldn't have to scroll past their own details to find it */}
      <Card className="flex flex-col gap-1">
        <p className="font-medium">{t('profile.needHelp')}</p>
        <p className="text-sm text-muted">
          {t('profile.needHelpBody')}
        </p>
        {/* Straight to the form (the answers are one tap away under Help) */}
        <Link to="/help?write=1" className="text-sm text-link underline">
          {t('profile.writeToSupport')}
        </Link>
        <Link to="/help" className="text-sm text-link underline">
          {t('profile.howToAnswers')}
        </Link>
        <Link to="/help/requests" state={{ from: true }} className="text-sm text-link underline">
          {t('profile.myRequests')}
        </Link>
        <p className="text-sm text-muted">
          {t('profile.orEmail')}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <CallUs className="pt-2" />
      </Card>

      <Card className="flex flex-col gap-4">
        {editing ? (
          <div className="flex flex-col gap-3">
            <Field id="profile-name" label={t('profile.name')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            {error && <Banner tone="bad">{error}</Banner>}
            <div className="flex gap-2">
              <Button busy={busy} disabled={name.trim().length < 2} onClick={saveName} className="flex-1">
                {t('common.save')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setName(user.name ?? '')
                  setError(null)
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Row label={t('profile.name')} value={user.name ?? ''} action={<button type="button" className="text-link" onClick={startEditing}>{t('common.edit')}</button>} />
        )}
        <Row
          label={t('profile.mobile')}
          value={`+91 ${formatPhone(user.phone)}`}
          action={
            <Link to="/profile/phone" className="text-link" aria-label={t('profile.changePhoneAria')}>
              {t('common.change')}
            </Link>
          }
        />
        <Row
          label={t('profile.email')}
          value={emailPending ? (user.email ? t('profile.emailNotVerified', { email: user.email }) : t('profile.notVerifiedYet')) : (user.email ?? '')}
          action={
            emailPending ? (
              <Link to="/verify-email" className="text-link" onClick={forgetAfterEmail}>
                {t('profile.verify')}
              </Link>
            ) : (
              <Link to="/profile/email" className="text-link">
                {t('common.change')}
              </Link>
            )
          }
        />
      </Card>

      <Card id="messages" className="flex scroll-mt-20 flex-col gap-4">
        <NotificationsRow />
        <SalonMessageSwitches />
      </Card>

      <Card id="language" className="flex scroll-mt-20 flex-col gap-2">
        <p className="font-medium">{t('language.title')}</p>
        <LanguagePicker />
        <p className="text-sm text-muted">{t('language.profileHint')}</p>
      </Card>

      <Card className="flex flex-col gap-1">
        <p className="font-medium">{t('profile.savedAddresses')}</p>
        <p className="text-sm text-muted">{t('profile.savedAddressesBody')}</p>
        <Link to="/places" className="text-sm text-link underline">
          {t('profile.manageAddresses')}
        </Link>
      </Card>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" busy={busy} onClick={() => out(false)}>
          {t('profile.signOut')}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmAll(true)}>
          {t('profile.signOutAll')}
        </Button>
        <Link to="/profile/delete" className="py-3 text-center text-sm text-bad underline">
          {t('profile.deleteAccount')}
        </Link>
      </div>

      <LegalLinks />

      <Sheet open={confirmAll} title={t('profile.signOutEverywhereTitle')} onClose={() => setConfirmAll(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('profile.signOutEverywhereBody')}</p>
          {outError && <Banner tone="bad">{outError}</Banner>}
          <Button busy={busy} onClick={() => out(true)}>
            {t('profile.signOutEverywhere')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmAll(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="[overflow-wrap:anywhere]">{value}</p>
      </div>
      {action}
    </div>
  )
}
