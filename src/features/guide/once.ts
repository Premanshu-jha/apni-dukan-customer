import { useCallback, useState } from 'react'
import { storage } from '../../lib/storage'
import { useSession } from '../../store/session'

/**
 * The guide's one-time hints and cards ("How booking works", "Got it" lines), each remembered once dismissed: per
 * account on this phone (as the language and the drafts are), so on a shared phone a second person still gets them,
 * and signing out and in again doesn't bring them back. Storage blocked: they come back next visit, nothing worse.
 */
export type GuideName =
  | 'howItWorks'
  | 'visitTip'
  | 'saveHome'
  | 'hint.salon'
  | 'hint.pickTime'
  | 'hint.booking'

const key = (userId: string, name: GuideName) => `ad.guide.${userId}.${name}`

export function guideDone(userId: string | undefined, name: GuideName): boolean {
  return !userId || storage.get(key(userId, name)) === '1'
}

export function markGuideDone(userId: string | undefined, name: GuideName): void {
  if (userId) storage.set(key(userId, name), '1')
}

/**
 * [whether it is still to be shown, dismiss it]. Never shown with nobody signed in. Read once when the screen opens:
 * dismissed in another tab, it goes from this one the next time the screen opens.
 */
export function useOnce(name: GuideName): [boolean, () => void] {
  const userId = useSession((s) => s.user?.id)
  const [done, setDone] = useState<string | null>(null)
  const shown = done !== `${userId}` && !guideDone(userId, name)
  const dismiss = useCallback(() => {
    markGuideDone(userId, name)
    setDone(`${userId}`)
  }, [userId, name])
  return [shown, dismiss]
}
