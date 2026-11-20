import type { InboxItem } from '../../api/notifications'
import { hasText, language, t } from '../../i18n'

/**
 * The message's title. A message written before the backend wrote in the reader's language comes in English only: in
 * another language, the title its type has here instead (the body stays as sent: it carries names and times).
 */
export function titleOf(m: Pick<InboxItem, 'type' | 'title'>): string {
  if (language() === 'en' || !englishOnly(m.title)) return m.title
  const key = `notifications.type${m.type}`
  return hasText(key) ? t(key) : m.title
}

/** Only Latin letters, digits and punctuation: written in English. */
function englishOnly(text: string): boolean {
  return /[A-Za-z]/.test(text) && /^[\x20-\x7E’‘“”–—…₹]*$/.test(text)
}
