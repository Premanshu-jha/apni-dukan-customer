import type { ServiceIconName } from './serviceIcons'

/**
 * The salon list's search box (GET /salons?q=, the backend's SalonSearch): what is sent for what the customer typed.
 * The backend finds a salon by its name or by one of its services (in part, any case, small slips forgiven from four
 * letters) and refuses fewer than 2 or more than 60 characters, so the app never sends those: below 2 the list is
 * shown as without a search, and the box takes at most 60.
 */
export const SEARCH_MIN = 2
export const SEARCH_MAX = 60
/** Typing waits this long for a pause before the list is asked again (one request per word, not per letter). */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * The quick chips under the box: the services people look for most, each with its picture and the word sent for it.
 * The chip's label is in the customer's language, but salons write their services' names mostly in English (the
 * partner app's catalogue suggests them in English), so the English word is what is searched for.
 */
export const SEARCH_CHIPS: ReadonlyArray<{ icon: ServiceIconName; label: string; q: string }> = [
  { icon: 'HAIRCUT', label: 'service.haircut', q: 'haircut' },
  { icon: 'BEARD', label: 'service.beard', q: 'beard' },
  { icon: 'FACIAL', label: 'service.facial', q: 'facial' },
  { icon: 'HAIR_COLOUR', label: 'service.hairColour', q: 'hair colour' },
  { icon: 'HEAD_MASSAGE', label: 'service.headMassage', q: 'head massage' },
  { icon: 'THREADING', label: 'service.threading', q: 'threading' },
  { icon: 'WAXING', label: 'service.waxing', q: 'waxing' },
]

/** The text as the backend reads it: spaces at the ends dropped, runs of spaces inside made one. */
export function tidySearch(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/** Characters as the backend counts them (a Hindi letter with its vowel sign is two, as in Java). */
export function searchLength(text: string): number {
  return [...text].length
}

/**
 * The services' names in every language the app speaks (src/i18n/<lang>/service.json, the chips' labels among them),
 * all in the main download: about 1 KB a language, so a Hindi word is understood whichever language is showing (a
 * chip tapped in Hindi, then the app switched to English, still searches "beard").
 */
const SERVICE_NAMES = import.meta.glob<Record<string, string>>('../i18n/*/service.json', { eager: true, import: 'default' })
const langOf = (path: string) => path.split('/')[2]
const ENGLISH_NAMES = SERVICE_NAMES['../i18n/en/service.json'] ?? {}

/**
 * Folded for matching typed words against the app's own: the same letters however the phone's keyboard made them
 * (NFC), without the nukta (फ़ and फ: many keyboards never type it) and without the invisible joiners Telugu and
 * Kannada names carry (హెయిర్‌కట్), in lower case, spaces tidied.
 */
export function foldSearch(text: string): string {
  return tidySearch(text.normalize('NFC').replace(/[\u093C\u200C\u200D]/g, '')).toLocaleLowerCase()
}

/** A chip's label in each of the app's languages. */
function chipLabels(chip: (typeof SEARCH_CHIPS)[number]): string[] {
  const key = chip.label.slice('service.'.length)
  return Object.values(SERVICE_NAMES).map((names) => names[key]).filter((l): l is string => typeof l === 'string')
}
const CHIP_WORDS: ReadonlyArray<{ folded: string; q: string }> = SEARCH_CHIPS.flatMap((c) =>
  chipLabels(c).map((l) => ({ folded: foldSearch(l), q: c.q })),
)

/** The chip whose label (in any of the 6 languages) this text is, as its English word; null for none. */
export function chipOf(text: string): string | null {
  const folded = foldSearch(text)
  return CHIP_WORDS.find((c) => c.folded === folded)?.q ?? null
}

/**
 * Every service name in another language, with the English it stands for: whole ("हेड मसाज" is "head massage") and
 * word by word where both have as many words ("मसाज" is "massage"), as the partner app's catalogue names them.
 */
interface Named {
  folded: string
  words: string[]
  english: string
  englishWords: string[] | null
}
const NAMED: readonly Named[] = Object.entries(SERVICE_NAMES)
  .filter(([path]) => langOf(path) !== 'en')
  .flatMap(([, names]) => Object.entries(names).filter(([key]) => ENGLISH_NAMES[key]).map(([key, name]) => [name, ENGLISH_NAMES[key]] as const))
  .map(([name, english]) => {
    const folded = foldSearch(name)
    const words = folded.split(' ')
    const englishWords = english.toLowerCase().split(' ')
    return { folded, words, english: english.toLowerCase(), englishWords: englishWords.length === words.length ? englishWords : null }
  })

/** A word typed in another script (Devanagari, Telugu…); Latin ("baal", "facial") and digits are sent as typed. */
const NOT_LATIN = /(?=\p{L})\P{Script=Latin}/u
/** From this many characters, a word typed is also matched as the start of a name's word ("फेशि" → facial). */
export const WORD_START_MIN = 3

/**
 * One word in another script, as the English word of a service name it is ("बियर्ड" → beard, "मसाज" → massage,
 * "हेयर" → hair), or the start of one; null when it is none. A whole word beats a start; between names that read the
 * same word differently, the English word most of them use.
 */
function englishWord(word: string): string | null {
  const found: Array<{ rank: number; english: string }> = []
  for (const n of NAMED) {
    n.words.forEach((w, i) => {
      const english = n.englishWords ? n.englishWords[i] : n.english
      if (w === word) found.push({ rank: n.englishWords ? 0 : 1, english })
      else if ([...word].length >= WORD_START_MIN && w.startsWith(word)) found.push({ rank: 2, english })
    })
  }
  if (found.length === 0) return null
  const best = Math.min(...found.map((f) => f.rank))
  const counts = new Map<string, number>()
  for (const f of found) if (f.rank === best) counts.set(f.english, (counts.get(f.english) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * The words to search for what was typed in another language. Salons name their services mostly in English (the
 * partner app suggests them in English), so a Hindi, Telugu… word the app itself uses for a service is sent as its
 * English word: a whole service name ("हेयर कलर" → hair colour), else each word when every word in another script is
 * a service word ("हेयर" → hair, "फेशियल" without its nukta → facial, "बियर्ड ट्रिम" → beard trim). When one of them
 * is not ("हेयर सैलून", "राजू हेयर"), the text is sent as typed: it is likely a salon's name written in Hindi, and the
 * backend needs every word to match, so "hair सैलून" would find neither that salon nor anything else.
 */
export function englishSearch(text: string): string {
  const tidy = tidySearch(text)
  const folded = foldSearch(tidy)
  if (!NOT_LATIN.test(folded)) return tidy
  const whole = NAMED.find((n) => n.folded === folded)
  if (whole) return whole.english
  const words = tidy.split(' ').map((typed) => (NOT_LATIN.test(typed) ? englishWord(foldSearch(typed)) : typed))
  return words.every((w) => w !== null) ? words.join(' ') : tidy
}

/**
 * What to send as q for this text ('' for no search: nothing typed, or still too short). A chip tapped (`chip`, its
 * English word, kept with the text: the label in the box may be in another language by now) or a chip's label typed
 * in any of the 6 languages ("फ़ेशियल") is sent as the chip's English word; other words in another script as
 * englishSearch reads them.
 */
export function searchQuery(text: string, chip: string | null = null): string {
  const tidy = tidySearch(text)
  const length = searchLength(tidy)
  if (length < SEARCH_MIN) return ''
  const q = chip ?? chipOf(tidy) ?? englishSearch(tidy)
  return searchLength(q) > SEARCH_MAX ? [...q].slice(0, SEARCH_MAX).join('') : q
}
