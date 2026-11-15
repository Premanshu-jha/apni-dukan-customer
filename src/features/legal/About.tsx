import { Link } from 'react-router'
import { SALONS_RADIUS_KM } from '../../api/salons'
import { BUSINESS } from '../../lib/business'
import { useSession } from '../../store/session'
import { Brand } from '../auth/Brand'
import { LegalPage, Section } from './LegalPage'

/**
 * What Clozest is, for customers: the front page for first-time visitors to clozest.in (`/` comes here). Nothing
 * about payments to Clozest: customers pay nothing; salon owners are pointed to the partner app.
 */
export function About() {
  const status = useSession((s) => s.status)
  const signedIn = status === 'signedIn'
  const start = signedIn
    ? { to: '/', label: 'Find a salon' }
    : { to: '/signin', label: 'Sign in or sign up' }
  return (
    <LegalPage path="/about" title="About Clozest">
      <Brand subtitle="Near You. For You." />
      <p className="text-ink">
        Clozest helps you book a time at a salon near you, and helps local salons take bookings online.
      </p>
      {/* While the session is still starting, no button yet: it would say "Sign in" to someone signed in */}
      {status !== 'starting' && (
        <Link
          to={start.to}
          className="flex min-h-12 items-center justify-center rounded-xl bg-brand bg-linear-to-br from-brand to-brand-deep px-4 font-semibold text-brand-ink shadow-lg shadow-brand/25 hover:brightness-110"
        >
          {start.label}
        </Link>
      )}

      <Section title="For customers">
        <ul>
          <li>
            Find salons within {SALONS_RADIUS_KM} km of you, with their services, prices, offers and opening hours.
          </li>
          <li>Pick your services and a free time, and book in a few taps. You get a start code for the salon.</li>
          <li>Move or cancel a booking from the app, and get a message when the salon changes anything.</li>
        </ul>
        <p>
          <strong>Booking is free for customers.</strong> You pay the salon for its services at the salon, as you do
          today. Clozest takes no payment from customers.
        </p>
      </Section>

      <Section title="Where we work">
        <p>Hyderabad, Telangana, starting with a few areas and growing from there.</p>
      </Section>

      <p className="text-sm">
        Own a salon?{' '}
        <a href={BUSINESS.partnerSite} className="text-link underline">
          Clozest for salons
        </a>
        . Questions?{' '}
        <Link to="/contact" className="text-link underline">
          Contact us
        </Link>
        .
      </p>
    </LegalPage>
  )
}
