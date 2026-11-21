import { create } from 'zustand'
import { useSession } from './session'

/** What is typed in the salon list's search box, kept in this tab only (sessionStorage). */
export const SALON_SEARCH_KEY = 'ad.salonSearch'
/** The chip tapped, as its English word (SEARCH_CHIPS' q), kept with the text in this tab. */
export const SALON_SEARCH_CHIP_KEY = 'ad.salonSearchChip'

function read(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, text: string): void {
  try {
    if (text) window.sessionStorage.setItem(key, text)
    else window.sessionStorage.removeItem(key)
  } catch {
    /* storage blocked: the text lives only while the app is open */
  }
}

interface SalonSearchState {
  text: string
  /**
   * The chip tapped (its English word), null once the person types: its label in the box may be in another language
   * by now (tapped in Hindi, then the app switched to English), so the chip, not the words, says what is searched.
   */
  chip: string | null
  setText: (text: string, chip?: string | null) => void
  clear: () => void
}

/**
 * The search box's text. Kept here rather than in the screen, so it is still there after opening a salon and coming
 * back (the phone's Back or the page's back arrow, which opens Home afresh), after a reload, and when the customer
 * picks another place (the same words are searched near the new one). Not kept across tabs or sign-ins.
 */
export const useSalonSearch = create<SalonSearchState>((set) => ({
  text: read(SALON_SEARCH_KEY),
  chip: read(SALON_SEARCH_CHIP_KEY) || null,
  setText: (text, chip = null) => {
    write(SALON_SEARCH_KEY, text)
    write(SALON_SEARCH_CHIP_KEY, chip ?? '')
    set({ text, chip })
  },
  clear: () => {
    write(SALON_SEARCH_KEY, '')
    write(SALON_SEARCH_CHIP_KEY, '')
    set({ text: '', chip: null })
  },
}))

// A shared phone: the next person to sign in mustn't see what this one searched for. Any change to signed out (a
// sign-out, another tab's, the backend ending the session, also a session refused at start-up, which goes from
// 'starting' straight to signed out); main.tsx's whenSessionEnds clears it too
useSession.subscribe((now, before) => {
  if (now.status === 'signedOut' && before.status !== 'signedOut') useSalonSearch.getState().clear()
})
