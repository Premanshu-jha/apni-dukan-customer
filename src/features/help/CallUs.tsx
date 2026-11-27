import { CALL_LINK, whatsAppLink } from '../../lib/business'
import { isApp } from '../../lib/platform'
import { useT } from '../../i18n'

function PhoneIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l1.4-4.2A8 8 0 1 1 8.4 18.7z" />
    </svg>
  )
}

/**
 * "Call us" and "WhatsApp us", side by side, as plain links (they work on every screen: inside the app, on the crash
 * screen and the update screens, signed in or not, email verified or not). Getting a person is never more than one
 * tap away. `about` starts the WhatsApp message ("I need help with: …").
 */
export function CallUs({ about, className = '' }: { about?: string; className?: string }) {
  const t = useT()
  // A subject at most as long as the form takes (a link from outside can carry any `about`)
  const text = about ? t('help.whatsAppTextAbout', { about: about.slice(0, 100) }) : t('help.whatsAppText')
  const button =
    'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-brand bg-surface px-3 font-semibold text-link hover:bg-raised'
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
    <div className="flex gap-2">
      <a href={CALL_LINK} className={button}>
        <PhoneIcon />
        {t('help.callUs')}
      </a>
      {/* In the Play Store app a plain link is handed to WhatsApp; on the website a new tab keeps Clozest open */}
      <a href={whatsAppLink(text)} {...(isApp() ? {} : { target: '_blank', rel: 'noopener noreferrer' })} className={button}>
        <ChatIcon />
        {t('help.whatsAppUs')}
      </a>
    </div>
    {/* When someone answers (a call at 9 PM shouldn't make the number look dead) */}
    <p className="text-center text-xs text-muted">{t('help.callHours')}</p>
    </div>
  )
}
