import { Link } from 'react-router'
import { BUSINESS } from '../../lib/business'
import { useT } from '../../i18n'
import { LegalPage, Section } from './LegalPage'

/** The privacy policy (Digital Personal Data Protection Act, 2023). */
export function Privacy() {
  const t = useT()
  return (
    <LegalPage path="/privacy" title={t('legal.privacyTitle')} updated={BUSINESS.policiesUpdated} englishOnly>
      <p className="text-sm text-muted">
        This policy explains what personal data {BUSINESS.brand} collects from customers, why, who it is shared with, and your rights
        under the Digital Personal Data Protection Act, 2023. {BUSINESS.operator} is the data fiduciary.
      </p>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account:</strong> your mobile number, your name, and your email if you add one.
          </li>
          <li>
            <strong>Location:</strong> your phone's location when you look for salons near you, and the addresses you
            save (Home, Work and others).
          </li>
          <li>
            <strong>Bookings:</strong> the salons, services and times you book, move or cancel, your ratings, and your
            messages to support with any files you attach.
          </li>
          <li>
            <strong>Technical:</strong> sign-in sessions, notification settings, and the network address of requests
            (to stop abuse).
          </li>
        </ul>
      </Section>

      <Section title="Why we use it">
        <ul>
          <li>To sign you in, show salons near you, make and manage bookings, and send booking messages.</li>
          <li>To let the salon you booked see your name and booking (and nothing else about you).</li>
          <li>To answer support requests, prevent fraud and abuse, and meet legal duties.</li>
        </ul>
        <p>We do not sell your data and do not use it for third-party advertising.</p>
      </Section>

      <Section title="Who we share it with">
        <p>Only with services that run Clozest for us, each only for its own job:</p>
        <ul>
          <li>SMS (MSG91) and email (Resend) for codes and messages</li>
          <li>Hosting and storage (Railway, Neon, Redis Cloud, Cloudflare R2), and Cloudflare's robot check</li>
          <li>Maps and address lookup (Google)</li>
        </ul>
        <p>And with authorities when the law requires it.</p>
      </Section>

      <Section title="How long we keep it">
        <p>
          While your account is open. When you delete your account (Profile → Delete my account), your name, number
          and email are removed and your past bookings are kept only without them, for the salon's records and the
          law.
        </p>
      </Section>

      <Section title="Your rights">
        <ul>
          <li>See and correct your details in Profile; delete your account from the app any time.</li>
          <li>Ask what data we hold about you, withdraw consent, or nominate someone to act for you.</li>
          <li>Complain to us first, and then to the Data Protection Board of India.</li>
        </ul>
        <p>
          Write to {BUSINESS.operator} at <span className="[overflow-wrap:anywhere]">{BUSINESS.email}</span> (see{' '}
          <Link to="/contact" className="text-link underline">
            Contact
          </Link>
          ).
        </p>
      </Section>

      <Section title="Children">
        <p>Clozest is meant for people aged 18 and over. Someone younger should book with a parent or guardian.</p>
      </Section>

      <Section title="Changes">
        <p>When this policy changes, the date at the top changes, and important changes are told in the app.</p>
      </Section>
    </LegalPage>
  )
}
