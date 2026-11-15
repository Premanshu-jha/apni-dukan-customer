import { Link } from 'react-router'
import { BUSINESS } from '../../lib/business'
import { LegalPage, Section } from './LegalPage'

/** How to reach Clozest: email, phone and address (also the grievance contact under the privacy policy). */
export function Contact() {
  const tel = BUSINESS.phone.replace(/\s/g, '')
  return (
    <LegalPage path="/contact" title="Contact us">
      <Section title="Write or call">
        <dl className="flex flex-col gap-3">
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${BUSINESS.email}`} className="text-link underline [overflow-wrap:anywhere]">
                {BUSINESS.email}
              </a>
            </dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${tel}`} className="text-link underline">
                {BUSINESS.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd className="text-ink">
              {BUSINESS.operator} ({BUSINESS.brand}), {BUSINESS.address}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Help with a booking">
        <p>
          Signed in? Use <strong>Profile → Write to support</strong> with your booking number. We reply by email, and
          you can read our replies under <strong>Profile → My requests</strong>.
        </p>
      </Section>

      <Section title="Grievance officer">
        <p>
          For complaints about the service or about your personal data (see the{' '}
          <Link to="/privacy" className="text-link underline">
            privacy policy
          </Link>
          ), write to {BUSINESS.operator} at <span className="[overflow-wrap:anywhere]">{BUSINESS.email}</span>.
        </p>
      </Section>
    </LegalPage>
  )
}
