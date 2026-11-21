import { useRef, type RefObject } from 'react'
import { ServiceIcon } from '../../components/ServiceIcon'
import { SEARCH_CHIPS, SEARCH_MAX, SEARCH_MIN, chipOf, searchLength, tidySearch } from '../../lib/salonSearch'
import { useT } from '../../i18n'

/**
 * The search box above the salon list: a salon's name or a service ("facial", "Raju"), with a clear (×) button, the
 * keyboard's Search key, and quick chips for the services people look for most (tap one to search for it, tap it
 * again to go back to all salons). The list itself waits for a pause in typing (SalonList).
 */
export function SalonSearchBox({
  text,
  chip,
  onText,
  onSubmit,
  onClear,
  inputRef,
}: {
  text: string
  /** The chip tapped (its English word), null when the words were typed */
  chip: string | null
  /** chip: that chip was tapped (its English word), search at once (no pause to wait for) */
  onText: (text: string, chip?: string) => void
  /** The keyboard's Search key (or Enter): search now, without waiting for the pause */
  onSubmit: () => void
  onClear: () => void
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const t = useT()
  const own = useRef<HTMLInputElement | null>(null)
  const input = inputRef ?? own
  const tidy = tidySearch(text)
  const tooShort = tidy !== '' && searchLength(tidy) < SEARCH_MIN
  const labels = SEARCH_CHIPS.map((c) => t(c.label))
  // The chip tapped, or the one whose label (in any of the 6 languages) was typed, shows pressed
  const pressed = chip ?? chipOf(tidy)
  const active = SEARCH_CHIPS.findIndex((c) => c.q === pressed)

  return (
    <form
      role="search"
      aria-label={t('salon.searchLabel')}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
        // The phone's keyboard goes away so the results can be seen
        input.current?.blur()
      }}
    >
      <div className="relative">
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          ref={input}
          id="salon-search"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={SEARCH_MAX}
          aria-label={t('salon.searchLabel')}
          aria-describedby={tooShort ? 'salon-search-hint' : undefined}
          placeholder={t('salon.searchPlaceholder')}
          value={text}
          onChange={(e) => onText(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-line bg-surface pr-12 pl-10 text-base text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {text !== '' && (
          <button
            type="button"
            aria-label={t('salon.clearSearch')}
            onClick={() => {
              onClear()
              input.current?.focus()
            }}
            className="absolute top-0 right-0 flex h-12 w-12 items-center justify-center rounded-xl text-muted hover:text-ink"
          >
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>
      {tooShort && (
        <p id="salon-search-hint" className="text-sm text-muted">
          {t('salon.searchTypeMore')}
        </p>
      )}
      <div role="group" aria-label={t('salon.searchChipsLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SEARCH_CHIPS.map((c, i) => (
          <button
            key={c.q}
            type="button"
            aria-pressed={active === i}
            onClick={() => (active === i ? onClear() : onText(labels[i], c.q))}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition ${active === i ? 'border-brand bg-brand/10 text-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}
          >
            <ServiceIcon icon={c.icon} size={18} />
            {labels[i]}
          </button>
        ))}
      </div>
    </form>
  )
}
