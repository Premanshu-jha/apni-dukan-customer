import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useT } from '../../i18n'
import { needsEmail, useSession } from '../../store/session'
import { forgetAfterEmail, rememberAfterEmail } from '../auth/flow'
import { HOWTOS, searchHowTos, type HowTo } from './howto'
import { CallUs } from './CallUs'

/**
 * "How do I…?": a search box and the short answers, each opened by tapping its question, with "Take me there". What
 * is typed in the search is only for this visit (nothing personal is kept).
 */
export function HowToList({ onWrite }: { onWrite: (subject?: string) => void }) {
  const t = useT()
  const navigate = useNavigate()
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const shown = searchHowTos(query, t, HOWTOS)
  const user = useSession((s) => s.user)
  const emailPending = user !== null && needsEmail(user)

  function go(h: HowTo) {
    if (h.to === 'call') return
    if (h.to === 'write') onWrite(h.subjectKey ? t(h.subjectKey) : undefined)
    else if (h.to === '/verify-email') {
      // Verifying from an answer comes back to Need help (not an older detour's form)
      forgetAfterEmail()
      rememberAfterEmail('/help', user?.id)
      navigate(h.to)
    } else navigate(h.to)
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="font-display text-lg font-semibold">
        {t('howto.title')}
      </h2>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-search`} className="sr-only">
          {t('howto.searchLabel')}
        </label>
        <input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('howto.searchPlaceholder')}
          className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
        />
      </div>
      {shown.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          {t('howto.noMatch')}{' '}
          <button type="button" className="min-h-11 font-semibold text-link underline" onClick={() => onWrite(query.trim() || undefined)}>
            {t('howto.writeInstead')}
          </button>
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((h) => {
            // A search down to a few answers shows them open: no extra tap to read what was looked for
            const expanded = open === h.id || (query.trim() !== '' && shown.length <= 3 && open !== `-${h.id}`)
            return (
              <li key={h.id} className="rounded-xl border border-line bg-surface">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`${id}-${h.id}`}
                  onClick={() => setOpen(expanded ? `-${h.id}` : h.id)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left font-medium"
                >
                  <span>{t(`howto.${h.id}Q`)}</span>
                  <span aria-hidden className={`shrink-0 text-muted transition ${expanded ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </button>
                {expanded && (
                  <div id={`${id}-${h.id}`} className="flex flex-col gap-3 border-t border-line px-4 py-3">
                    <p className="text-sm text-muted">{t(`howto.${h.id}A`)}</p>
                    {h.to === 'call' ? (
                      <CallUs about={t(`howto.${h.id}Q`)} />
                    ) : h.to === '/verify-email' && !emailPending ? null : (
                    <button
                      type="button"
                      onClick={() => go(h)}
                      className="inline-flex min-h-11 items-center self-start rounded-xl bg-raised px-4 text-sm font-semibold text-link hover:bg-line"
                    >
                      {t(h.buttonKey ?? 'howto.takeMeThere')} →
                    </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
