import { Link } from 'react-router'
import { SALONS_RADIUS_KM } from '../../api/salons'
import { spaceBefore, useT } from '../../i18n'
import { LanguagePicker } from '../../i18n/LanguagePicker'
import { BUSINESS } from '../../lib/business'
import { useSession } from '../../store/session'
import { Brand } from '../auth/Brand'
import { LegalPage, Section } from './LegalPage'

/**
 * What Clozest is, for customers: the front page for first-time visitors to clozest.in (`/` comes here). Nothing
 * about payments to Clozest: customers pay nothing; salon owners are pointed to the partner app. In the reader's
 * language (a visitor can pick one here, as on the sign-in screen).
 */
export function About() {
  const t = useT()
  const status = useSession((s) => s.status)
  const signedIn = status === 'signedIn'
  const start = signedIn
    ? { to: '/', label: t('bookings.findSalon') }
    : { to: '/signin', label: t('legal.signInOrUp') }
  return (
    <LegalPage path="/about" title={t('legal.aboutTitle')}>
      <Brand subtitle="Near You. For You." />
      {/* A first-time visitor picks a language here: a real choice, kept on this phone and by the sign-in screen */}
      {status === 'signedOut' && <LanguagePicker heading compact />}
      <p className="text-ink">{t('legal.aboutIntro')}</p>
      {/* While the session is still starting, no button yet: it would say "Sign in" to someone signed in */}
      {status !== 'starting' && (
        <Link
          to={start.to}
          className="flex min-h-12 items-center justify-center rounded-xl py-2 text-center bg-brand bg-linear-to-br from-brand to-brand-deep px-4 font-semibold text-brand-ink shadow-lg shadow-brand/25 hover:brightness-110"
        >
          {start.label}
        </Link>
      )}

      <Section title={t('legal.aboutForCustomersTitle')}>
        <ul>
          <li>{t('legal.aboutFind', { km: SALONS_RADIUS_KM })}</li>
          <li>{t('legal.aboutBook')}</li>
          <li>{t('legal.aboutMove')}</li>
        </ul>
        <p>
          <strong>{t('legal.aboutFreeBold')}</strong>
          {spaceBefore(t('legal.aboutFreeAfter'))}
          {t('legal.aboutFreeAfter')}
        </p>
      </Section>

      <Section title={t('legal.aboutWhereTitle')}>
        <p>{t('legal.aboutWhere')}</p>
      </Section>

      <p className="text-sm">
        {t('legal.aboutOwnSalonBefore')}{' '}
        <a href={BUSINESS.partnerSite} className="text-link underline">
          {t('legal.aboutOwnSalonLink')}
        </a>
        {spaceBefore(t('legal.aboutOwnSalonAfter'))}
        {t('legal.aboutOwnSalonAfter')} {t('legal.aboutQuestionsBefore')}{' '}
        <Link to="/contact" className="text-link underline">
          {t('legal.aboutQuestionsLink')}
        </Link>
        {spaceBefore(t('legal.aboutQuestionsAfter'))}
        {t('legal.aboutQuestionsAfter')}
      </p>
    </LegalPage>
  )
}
