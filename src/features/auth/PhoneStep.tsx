import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { isApiError, messageOf } from '../../api/errors'
import { Banner, Button, Field, Page } from '../../components/ui'
import { Turnstile } from '../../components/Turnstile'
import { keepShownLanguage, useT } from '../../i18n'
import { LanguageLine } from '../../i18n/LanguageFirst'
import { TURNSTILE_SITE_KEY } from '../../lib/config'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { keepTypedPhone, rememberPhoneMove, takePhoneMove, takeTypedPhone } from '../../lib/phoneMoved'
import { LegalLinks } from '../legal/LegalPage'
import { Brand } from './Brand'
import { returningToSalon } from './flow'
import { HelpButton } from '../help/HelpButton'

export function PhoneStep() {
  const t = useT()
  const navigate = useNavigate()
  const deleted = Boolean((useLocation().state as { deleted?: boolean } | null)?.deleted)
  // A phone change whose answer was lost and which ended the session: it most likely went through
  const [movedTo] = useState(takePhoneMove)
  // Opened a salon's shared link while signed out: say why sign-in comes first (sign-in then opens that salon)
  const [forSalon] = useState(returningToSalon)
  // Back from the language screen (Change): what was typed is still there
  const [phone, setPhone] = useState(() => takeTypedPhone() ?? movedTo ?? '')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const normalized = normalizePhone(phone)
  const needsCaptcha = Boolean(TURNSTILE_SITE_KEY)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!normalized) {
      setError(t('auth.phoneInvalid'))
      return
    }
    setBusy(true)
    setError(null)
    // Signing in with the language on screen keeps it: the app doesn't offer the languages again afterwards
    keepShownLanguage()
    try {
      await authApi.sendCode(normalized, captcha)
      navigate('/signin/code', { state: { phone: normalized } })
    } catch (err) {
      setError(messageOf(err))
      // A robot-check token works once; any failure needs a fresh one.
      if (needsCaptcha || isApiError(err, 'CAPTCHA_FAILED') || isApiError(err, 'CAPTCHA_REQUIRED')) setResetKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      {/* No title bar here: Help (to Contact) sits at the top right by itself */}
      <div className="-mb-2 flex justify-end">
        <HelpButton />
      </div>
      <Brand subtitle={t('auth.phoneSubtitle')} />
      {forSalon && <Banner tone="info">{t('guide.signInForSalon')}</Banner>}
      {/* The language was chosen on the screen before this one (LanguageFirst); here it can be changed */}
      <LanguageLine
        onLeave={() => {
          // The sign-in screen closes for the language screen: keep the number typed and the moved notice for its return
          keepTypedPhone(phone)
          if (movedTo) rememberPhoneMove(movedTo)
        }}
      />
      {deleted && <Banner tone="info">{t('auth.phoneDeleted')}</Banner>}
      {movedTo && (
        <Banner tone="info">{t('auth.phoneMoved', { phone: formatPhone(movedTo) })}</Banner>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          id="phone"
          label={t('auth.phoneLabel')}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={t('auth.phonePlaceholder')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint={t('auth.phoneHint')}
        />
        <Turnstile onToken={setCaptcha} resetKey={resetKey} />
        {error && <Banner tone="bad">{error}</Banner>}
        <Button type="submit" busy={busy} disabled={!normalized || (needsCaptcha && !captcha)}>
          {t('auth.sendCode')}
        </Button>
      </form>
      <p className="mt-2 text-center text-sm text-muted">
        {t('auth.phoneLost')}{' '}
        <Link to="/signin/recover" className="text-link underline">
          {t('auth.phoneRecoverLink')}
        </Link>
      </p>
      <div className="mt-auto pt-6">
        <LegalLinks />
      </div>
    </Page>
  )
}
