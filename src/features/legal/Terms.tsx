import { Link } from 'react-router'
import { BUSINESS } from '../../lib/business'
import { LegalPage, Section } from './LegalPage'

/** The terms of service for customers (salons have their own, on the partner app). */
export function Terms() {
  return (
    <LegalPage path="/terms" title="Terms of service" updated={BUSINESS.policiesUpdated}>
      <p className="text-sm text-muted">
        These terms are an agreement between you and {BUSINESS.operator}, who runs {BUSINESS.brand} (
        {BUSINESS.website}). By using {BUSINESS.brand} to find and book salons you accept them. Salon owners have their
        own terms (see "Own a salon?" on the About page).
      </p>

      <Section title="The service">
        <p>
          {BUSINESS.brand} lets customers find salons near them and book a time, and lets salons manage their bookings.
          The salon, not {BUSINESS.brand}, provides the haircut or other service and is responsible for it, its price
          and its quality.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>You sign in with your own mobile number, and keep your phone and codes safe.</li>
          <li>The details you give must be true. You must be 18 or over, or book with a parent or guardian.</li>
          <li>You can delete your account any time from Profile.</li>
        </ul>
      </Section>

      <Section title="Bookings (customers)">
        <ul>
          <li>Booking is free. You pay the salon at the salon.</li>
          <li>Give the salon your start code when you arrive.</li>
          <li>Arrive on time: if you're more than 10 minutes late, the booking may be marked a no-show.</li>
          <li>Too many late cancels or missed bookings can stop you booking for a while.</li>
          <li>A salon may cancel or move a booking; you get a message in the app when it does.</li>
        </ul>
      </Section>

      <Section title="Fair use">
        <p>
          Don't misuse {BUSINESS.brand}: no fake bookings, false details, harassment of salons, or attempts to break or
          overload the service. We can suspend accounts that do.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          {BUSINESS.brand} is provided as it is. As far as the law allows, {BUSINESS.operator} is not liable for a
          salon's service, or for losses from the service being unavailable for a while.
        </p>
      </Section>

      <Section title="Law and disputes">
        <p>
          These terms follow the laws of India. Disputes go to the courts of Hyderabad, Telangana. Write to us first (
          <Link to="/contact" className="text-link underline">
            Contact
          </Link>
          ); most things can be sorted out quickly.
        </p>
      </Section>

      <Section title="Changes">
        <p>When these terms change, the date at the top changes, and important changes are told in the app.</p>
      </Section>
    </LegalPage>
  )
}
