import { inEnglish } from '../../i18n'

/**
 * Need help's short answers (src/i18n/<lang>/howto.json: `<id>Q` the question, `<id>A` the answer), in the order a
 * first-time customer meets them. Each has "Take me there": the screen where it is done, or `write` for the form.
 * The numbers in the answers are the backend's rules (BookingService): free to cancel until 1 hour before the start
 * and for 10 minutes after booking; 3 missed or late-cancelled bookings within 60 days pause online booking for 30
 * days; at most 2 upcoming bookings; no moving within the last hour; ratings open for 14 days after a visit.
 */
export interface HowTo {
  id: string
  /** Where "Take me there" goes; 'write' opens Write to us here (with the topic's subject, if it has one). */
  to: string | 'write'
  /** For 'write': the subject the form starts with (an i18n key), unless the person already typed one. */
  subjectKey?: string
  /** The button's words (an i18n key), when not "Take me there". */
  buttonKey?: string
}

export const HOWTOS: readonly HowTo[] = [
  { id: 'booking', to: '/' },
  { id: 'services', to: '/' },
  { id: 'code', to: '/bookings' },
  { id: 'pay', to: '/bookings' },
  { id: 'move', to: '/bookings' },
  { id: 'freeCancel', to: '/bookings' },
  // A booking marked missed by mistake is put right by support: the form, with the subject already written
  { id: 'missed', to: 'write', subjectKey: 'howto.missedSubject' },
  { id: 'earlier', to: '/bookings' },
  { id: 'comeBack', to: '/profile#messages' },
  { id: 'offers', to: '/profile#messages' },
  { id: 'places', to: '/places' },
  { id: 'nearOther', to: '/places' },
  { id: 'ratings', to: '/bookings' },
  { id: 'notifications', to: '/profile#messages' },
  { id: 'phoneEmail', to: '/profile' },
  { id: 'language', to: '/profile#language' },
  { id: 'delete', to: '/profile/delete' },
  { id: 'noSalons', to: 'write', subjectKey: 'salon.addSalonsHelpAbout', buttonKey: 'howto.tellUs' },
]

/** Folded for matching: lower case, accents and look-alike forms made plain, spaces squeezed. */
function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * The answers matching what was typed, in their order: every word typed must appear in the question or the answer,
 * in the language shown or in English (someone reading Hindi may type "cancel"). Nothing typed: all of them.
 */
export function searchHowTos(query: string, t: (key: string) => string, list: readonly HowTo[] = HOWTOS): HowTo[] {
  const words = fold(query).split(' ').filter(Boolean)
  if (words.length === 0) return [...list]
  return list.filter((h) => {
    const text = fold(
      [t(`howto.${h.id}Q`), t(`howto.${h.id}A`), inEnglish(`howto.${h.id}Q`), inEnglish(`howto.${h.id}A`)].join(' '),
    )
    return words.every((w) => text.includes(w))
  })
}
