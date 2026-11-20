import { useSyncExternalStore } from 'react'
import { useT } from './index'
import { languageToastOpen, subscribeLanguageToast } from './languageToastState'

/** The confirmation after a language is chosen, at the bottom of the screen above the tabs (mounted at the app's root). */
export function LanguageToast() {
  const t = useT()
  const open = useSyncExternalStore(subscribeLanguageToast, languageToastOpen, () => false)
  if (!open) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
      <p role="status" className="max-w-md rounded-xl border border-line bg-raised px-4 py-2 text-sm shadow-lg">
        {t('language.changedToast')}
      </p>
    </div>
  )
}
