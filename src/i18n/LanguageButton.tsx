import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from '../components/ui'
import { LANGUAGES, useLanguage, useT } from './index'
import { GlobeIcon, LanguagePicker } from './LanguagePicker'

/**
 * "🌐 हिन्दी" at the top of Home: the languages one tap away from where people start (not only in Profile). One more
 * tap changes the app, and for a signed-in account its messages too.
 */
export function LanguageButton() {
  const t = useT()
  const lang = useLanguage()
  const [open, setOpen] = useState(false)
  const name = LANGUAGES.find((l) => l.code === lang)?.name ?? lang
  return (
    <>
      <button
        type="button"
        aria-label={t('language.button', { name })}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-link hover:bg-raised"
      >
        <GlobeIcon />
        <span lang={lang}>{name}</span>
      </button>
      {open &&
        createPortal(
          <Sheet open title={t('language.title')} onClose={() => setOpen(false)}>
            <LanguagePicker onChosen={() => setOpen(false)} />
          </Sheet>,
          document.body,
        )}
    </>
  )
}
