import { Link } from 'react-router'
import { spaceBefore, useT } from '../../i18n'
import { BUSINESS } from '../../lib/business'
import { CallUs } from '../help/CallUs'
import { LegalPage, Section } from './LegalPage'

/**
 * How to reach Clozest: email, phone and address (also the grievance contact under the privacy policy). The words are
 * in the reader's language; the email, phone and address are data, the same in every language.
 */
export function Contact() {
  const t = useT()
  const tel = BUSINESS.phone.replace(/\s/g, '')
  const profile = t('app.tabProfile')
  return (
    <LegalPage path="/contact" title={t('legal.contactTitle')}>
      {/* First, for someone who can't sign in (the usual reason a signed-out person is here): a person, one tap away */}
      <Section title={t('legal.contactCantSignInTitle')}>
        <p>{t('legal.contactCantSignInBody')}</p>
        <CallUs about={t('legal.contactCantSignInTitle')} className="mt-3" />
      </Section>
      <Section title={t('legal.contactWriteTitle')}>
        <dl className="flex flex-col gap-3">
          <div>
            <dt>{t('legal.contactEmail')}</dt>
            <dd>
              <a href={`mailto:${BUSINESS.email}`} className="text-link underline [overflow-wrap:anywhere]">
                {BUSINESS.email}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t('legal.contactPhone')}</dt>
            <dd>
              <a href={`tel:${tel}`} className="text-link underline">
                {BUSINESS.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t('legal.contactAddress')}</dt>
            <dd className="text-ink">
              {BUSINESS.operator} ({BUSINESS.brand}), {BUSINESS.address}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title={t('legal.contactHelpTitle')}>
        <p>
          {t('legal.contactHelpBefore')} <strong>{`${profile} → ${t('help.writeToSupport')}`}</strong>
          {spaceBefore(t('legal.contactHelpMiddle'))}
          {t('legal.contactHelpMiddle')} <strong>{`${profile} → ${t('help.myRequestsTitle')}`}</strong>
          {spaceBefore(t('legal.contactHelpAfter'))}
          {t('legal.contactHelpAfter')}
        </p>
      </Section>

      <Section title={t('legal.contactGrievanceTitle')}>
        <p>
          {t('legal.contactGrievanceBefore')}{' '}
          <Link to="/privacy" className="text-link underline">
            {t('legal.contactGrievanceLink')}
          </Link>
          {spaceBefore(t('legal.contactGrievanceMiddle', { operator: BUSINESS.operator }))}
          {t('legal.contactGrievanceMiddle', { operator: BUSINESS.operator })}{' '}
          <span className="[overflow-wrap:anywhere]">{BUSINESS.email}</span>
          {spaceBefore(t('legal.contactGrievanceAfter'))}
          {t('legal.contactGrievanceAfter')}
        </p>
      </Section>
    </LegalPage>
  )
}
