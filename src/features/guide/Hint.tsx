import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { useOnce, type GuideName } from './once'

/** The small "i" in a circle the guide's hints start with. */
export function TipIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * A first-time hint on a screen: one short line and "Got it", shown until tapped, once per account (./once). It is
 * a plain note, not a pop-up: nothing has to be closed before the screen can be used.
 */
export function Hint({ name, children }: { name: GuideName; children: ReactNode }) {
  const t = useT()
  const [shown, dismiss] = useOnce(name)
  if (!shown) return null
  return (
    <div role="note" className="flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
      <span className="text-link">
        <TipIcon />
      </span>
      <p className="min-w-0 flex-1">{children}</p>
      <button type="button" onClick={dismiss} className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-link hover:bg-raised">
        {t('guide.gotIt')}
      </button>
    </div>
  )
}
