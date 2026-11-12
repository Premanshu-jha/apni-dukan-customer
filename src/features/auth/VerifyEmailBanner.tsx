import { Link } from 'react-router'
import { needsEmail, useSession } from '../../store/session'
import { forgetAfterEmail } from './flow'

/**
 * Shown at the top of Home (and Profile) while the email isn't verified: what it's for and a button to do it now.
 * Not dismissible: booking and help need it. (Just after verifying, Shell's Screen says it worked.)
 */
export function VerifyEmailBanner() {
  const user = useSession((s) => s.user)
  if (!needsEmail(user)) return null
  return (
    <section
      aria-label="Email not verified"
      className="flex flex-col gap-2 rounded-2xl border border-warn/40 bg-warn/10 p-4"
    >
      <p className="font-semibold">🔒 Verify your email to secure your account</p>
      <p className="text-sm text-muted">You'll need it to book a salon and to get help from us. It takes a minute.</p>
      <Link
        to="/verify-email"
        onClick={forgetAfterEmail}
        className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-brand-ink hover:brightness-110"
      >
        Verify now
      </Link>
    </section>
  )
}
