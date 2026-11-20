import { Component, type ReactNode } from 'react'
import { useT } from '../i18n'

/**
 * Last line of defence: an error while a screen draws shows this instead of a blank page. "Start again" reloads
 * the app at Home. Around each screen (Shell, Bare: the bottom bar stays, and opening another screen clears it) and
 * around the whole app (an error outside any screen).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <Failed />
  }
}

/** What the boundary shows (a function component, so its words follow the language). */
function Failed() {
  const t = useT()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold">{t('ui.errorTitle')}</p>
      <p className="text-muted">{t('ui.errorBody')}</p>
      <button
        type="button"
        className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-brand-ink"
        onClick={() => window.location.assign('/')}
      >
        {t('ui.errorStartAgain')}
      </button>
    </div>
  )
}
