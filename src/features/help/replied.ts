import type { MyRequest } from '../../api/types'
import { storage } from '../../lib/storage'

/**
 * Which of support's replies this person has already read, per request: the request's lastMessageAt when its
 * conversation was last open. Kept per account on the phone (another account on a shared phone has its own), so the
 * Help button's dot goes once the reply was read, not only once it was answered. Only ids and times: nothing private.
 */
const seenKey = (userId: string) => `ad.helpSeen.${userId}`

function seenOf(userId: string): Record<string, string> {
  const saved = storage.getJson<Record<string, unknown>>(seenKey(userId))
  const out: Record<string, string> = {}
  if (saved && typeof saved === 'object') {
    for (const [id, at] of Object.entries(saved)) if (typeof at === 'string') out[id] = at
  }
  return out
}

/** The conversation of this request was open showing its messages up to `lastMessageAt`. */
export function markReplySeen(userId: string, ticketId: string, lastMessageAt: string): void {
  const seen = seenOf(userId)
  if (seen[ticketId] === lastMessageAt) return
  seen[ticketId] = lastMessageAt
  storage.setJson(seenKey(userId), seen)
}

/**
 * Whether support wrote on this request after the person last opened it: its lastReplyAt newer than the
 * lastMessageAt seen then, whatever the status now (a reply that also resolved it is RESOLVED, and still unread). A
 * list read before the reply was opened can be older than what was seen: compared by time, never "not equal". An
 * older backend without lastReplyAt: a WAITING request ("We replied") with newer messages than were seen.
 */
function unread(r: MyRequest, seen: Record<string, string>): boolean {
  const at = seen[r.id]
  if (r.lastReplyAt !== undefined) {
    return r.lastReplyAt !== null && (at === undefined || Date.parse(r.lastReplyAt) > Date.parse(at))
  }
  if (r.status !== 'WAITING') return false
  return at === undefined || Date.parse(r.lastMessageAt) > Date.parse(at)
}

/** Whether support replied to any of these requests with something this person hasn't opened yet (the Help dot). */
export function hasUnreadReply(userId: string, requests: readonly MyRequest[] | undefined): boolean {
  if (!requests?.length) return false
  const seen = seenOf(userId)
  return requests.some((r) => unread(r, seen))
}

/**
 * How many of these requests have a reply from us to read or answer: waiting on the person ("We replied"), or with a
 * reply not opened yet whatever the status (one that resolved the request counts until it is opened).
 */
export function repliedCount(userId: string, requests: readonly MyRequest[] | undefined): number {
  if (!requests?.length) return 0
  const seen = seenOf(userId)
  return requests.filter((r) => r.status === 'WAITING' || unread(r, seen)).length
}
