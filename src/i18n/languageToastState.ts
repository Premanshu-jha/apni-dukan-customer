/** How long the confirmation stays. */
const SHOWN_MS = 5000

let open = false
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function tell() {
  listeners.forEach((l) => l())
}

/**
 * Says, in the language just chosen, that it changed and where to change it again (Profile → Language, in its own
 * words): someone who tapped a script by mistake can find the way back. Shown by LanguageToast for a few seconds.
 */
export function announceLanguageChosen(): void {
  if (timer) clearTimeout(timer)
  open = true
  tell()
  timer = setTimeout(() => {
    open = false
    timer = null
    tell()
  }, SHOWN_MS)
}

export function subscribeLanguageToast(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function languageToastOpen(): boolean {
  return open
}
