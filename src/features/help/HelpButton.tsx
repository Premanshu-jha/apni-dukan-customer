import { Link, useLocation } from 'react-router'
import { useMyRequestsGlance } from '../../api/help'
import { useT } from '../../i18n'
import { needsEmail, signUpSteps, useSession } from '../../store/session'
import { screenSubject, useHelpLink } from './helpLink'
import { hasUnreadReply } from './replied'

function HelpIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.4-2.6 4" />
      <circle cx="12" cy="17.4" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * The Help button at the top right of every screen ("?" and the word, so it is found without reading English): to
 * Need help, or signed out to Contact. A dot on it while support has replied to one of my requests and I haven't
 * opened the reply yet.
 */
export function HelpButton({ about, text }: { about?: string; text?: string }) {
  const t = useT()
  const { pathname } = useLocation()
  const to = useHelpLink(about ?? screenSubject(pathname, t), text)
  const user = useSession((s) => (s.status === 'signedIn' ? s.user : null))
  // Only someone who verified an email can have requests (Need help needs it): nobody else asks
  const mayHaveRequests = user !== null && signUpSteps(user).length === 0 && !needsEmail(user)
  return (
    <Link
      to={to}
      className="relative inline-flex h-11 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm font-medium text-link hover:bg-raised"
    >
      <HelpIcon />
      <span>{t('ui.help')}</span>
      {mayHaveRequests && <RepliedDot userId={user.id} />}
    </Link>
  )
}

/** Its own component: the list is read only for someone who can have requests (and never in signed-out screens). */
function RepliedDot({ userId }: { userId: string }) {
  const t = useT()
  const list = useMyRequestsGlance(true)
  if (!hasUnreadReply(userId, list.data)) return null
  return (
    <>
      <span aria-hidden className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-accent" />
      <span className="sr-only">{t('ui.helpReplied')}</span>
    </>
  )
}
