import { TicketFilesMock, type ShownFile } from './ticketFiles'
import { createHash } from 'node:crypto'
import type { BrowserContext, Route } from '@playwright/test'

/**
 * A fake backend for the end-to-end tests. Shapes follow the backend's records (AuthResponses, BookingResponses,
 * InboxPage); errors follow ErrorResponse {code, message, details}. State lives per test.
 */
export const API = 'http://api.test'

/** An ETag as Spring's ShallowEtagHeaderFilter makes it: "0" and the MD5 of the body, in quotes. */
export function etagOf(body: string): string {
  return `"0${createHash('md5').update(body).digest('hex')}"`
}

/** If-None-Match holds this ETag (a list, weak or strong, or *), as the filter compares them. */
function matches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  return ifNoneMatch.split(',').some((t) => t.trim() === '*' || t.trim().replace(/^W\//, '') === etag)
}
const IST = 5.5 * 3600_000

/** AuthService refresh grace (app.auth.refresh-grace-seconds, 30), and its retry time (RETRY_GRACE, 60 s). */
const REFRESH_GRACE_MS = 30_000
const RETRY_GRACE_MS = 60_000
/** Past bookings per page (BookingService.PAST_PAGE); messages per page (InboxService). */
const PAST_PAGE = 30
const INBOX_PAGE = 30

/**
 * An instant's microseconds since 1970, from the backend's text ("…T04:30:00.123456Z"): the backend orders and
 * pages by the microsecond, so the fake does too (a JavaScript Date keeps only milliseconds).
 */
export function micros(instant: string): number {
  const fraction = (instant.match(/\.(\d+)Z$/)?.[1] ?? '').padEnd(6, '0').slice(0, 6)
  return Math.floor(Date.parse(instant) / 1000) * 1_000_000 + Number(fraction)
}

/** What Spring can read as an Instant query value (ISO-8601, in UTC). */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?Z$/
/** This fake's booking ids stand in for the backend's UUIDs: anything else is unreadable. */
const BOOKING_ID = /^b\d+$/

export interface MockUser {
  id: string
  phone: string
  name: string | null
  email: string | null
  emailVerified: boolean
  admin: boolean
}

export interface Call {
  method: string
  path: string
  body: unknown
  auth: string | null
  idempotencyKey: string | null
  /** When it arrived (ms), to check the waits between retries. */
  at: number
}

/** "2026-11-05" + "15:45" India time → ISO instant. */
/** SalonOffer.priceOf: to the rupee, half up, never below ₹1. */
function offerPriceOf(paise: number, pct: number): number {
  if (paise <= 0) return paise
  return Math.max(1, Math.floor((paise * (100 - pct) + 5000) / 10000)) * 100
}

export function istInstant(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, h, min) - IST).toISOString()
}

export function todayIst(): string {
  return new Date(Date.now() + IST).toISOString().slice(0, 10)
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const SALON = {
  id: 's1',
  name: 'Shine Unisex Salon',
  addressLine: 'Shop 12, Ithum Tower',
  area: 'Sector 62',
  city: 'Noida',
  pincode: '201309',
  latitude: 28.62,
  longitude: 77.36,
  mapLink: 'https://maps.google.com/?q=28.62,77.36',
  hours: [1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, open: '10:00', close: '20:00' })),
  pausedUntil: null as string | null,
  photoUrl: null,
  maxDaysAhead: 7,
  closedDates: [] as string[],
  rating: { count: 12, average: 4.6, tags: [{ tag: 'CLEAN', label: 'Clean', count: 9 }, { tag: 'ON_TIME', label: 'On time', count: 4 }] },
}

/** BookingResponses.SalonSummary: what a card shows (s1 open now, s2 new and closed today). */
function card(over: Record<string, unknown>) {
  return {
    addressLine: 'Shop 12, Ithum Tower',
    rating: { count: 0, average: null, tags: [] },
    topServices: [],
    serviceCount: 0,
    today: null,
    openNow: null,
    closedToday: false,
    registered: true,
    ...over,
  }
}

export const SERVICES = [
  { id: 'v1', name: 'Haircut', durationMinutes: 30, pricePaise: 20000, priceIsFrom: false },
  { id: 'v2', name: 'Beard trim', durationMinutes: 15, pricePaise: 10000, priceIsFrom: false },
  { id: 'v3', name: 'Hair colour', durationMinutes: 60, pricePaise: 80000, priceIsFrom: true },
]

export const TIMES = ['10:00', '11:30', '13:00', '15:45', '17:15', '18:30']
/** BookingService: a cancel less than this before the start is late, except within FREE_CANCEL_MINUTES of booking. */
const LATE_CANCEL_MS = 3600_000
const FREE_CANCEL_MINUTES = 10

/** PhoneNumbers.normalize: "+91 98480 12345" → "9848012345", or null. */
function normalize(input: unknown): string | null {
  let d = String(input ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

/** @Size and @NotBlank of a place's address fields (PlaceRequests): each field's own key, as bean validation gives. */
function sizeErrors(b: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [field, min, max] of [['addressLine', 2, 200], ['area', 2, 100], ['city', 2, 60]] as const) {
    const v = b?.[field]
    if (typeof v !== 'string' || !v.trim()) out[field] = 'must not be blank'
    else if (v.length < min || v.length > max) out[field] = `size must be between ${min} and ${max}`
  }
  if (!/^[1-9][0-9]{5}$/.test(b?.pincode ?? '')) out.pincode = 'must be a 6-digit pincode'
  return out
}

export interface MockTicket {
  id: string
  number: string
  owner: string
  app: string
  subject: string | null
  message: string
  status: 'OPEN' | 'WAITING' | 'RESOLVED'
  createdAt: string
  lastMessageAt: string
  messages: Array<{ seq: number; fromSupport: boolean; supportName: string | null; body: string; attachments: number; at: string; files?: ShownFile[] }>
}

/** TicketService.MyTicket */
function myTicket(t: MockTicket) {
  return { id: t.id, number: t.number, subject: t.subject, status: t.status, createdAt: t.createdAt, lastMessageAt: t.lastMessageAt }
}

export class MockApi {
  user: MockUser = { id: 'u1', phone: '9848012345', name: null, email: null, emailVerified: false, admin: false }
  /** "Need help" tickets sent, in order. */
  tickets: MockTicket[] = []
  /** Support files (TicketFileService): photos and PDFs, videos to the fake R2. */
  ticketFiles = new TicketFilesMock(API, API)
  /** Messages of theirs in the last hour, new questions included (TicketService: 429 TOO_MANY_MESSAGES past 20). */
  addedThisHour = 0
  /** A support reply on a ticket, as the admin website would add it (it then waits on the customer). */
  supportReplies(ticket: MockTicket, body: string, name = 'Neha') {
    ticket.messages.push({ seq: ticket.messages.length + 1, fromSupport: true, supportName: name, body, attachments: 0, at: new Date().toISOString() })
    ticket.status = 'WAITING'
    ticket.lastMessageAt = new Date().toISOString()
    // TicketService.notifyReplied: "Support replied" in this app's list (never the reply's words)
    this.inbox.unshift({ id: `n${this.inbox.length + 1}`, type: 'CUSTOMERHELP_REPLIED', title: `Support replied on ${ticket.number}`, body: 'We replied to your question. Tap to read it.', url: `/help/requests/${ticket.id}`, sentAt: new Date().toISOString(), read: false })
  }
  /** Someone else's ticket (to check it is never shown). */
  addOthersTicket(): MockTicket {
    const t = this.newTicket('CUSTOMER', 'Not mine', 'Another account asked this.', 'someone-else')
    return t
  }
  newTicket(app: string, subject: string | null, message: string, owner = this.user.id): MockTicket {
    const n = 1001 + this.tickets.length
    const at = new Date().toISOString()
    const t: MockTicket = {
      id: `t${n}`, number: `CLZ-${n}`, owner, app, subject, message, status: 'OPEN', createdAt: at, lastMessageAt: at,
      messages: [{ seq: 1, fromSupport: false, supportName: null, body: message, attachments: 0, at }],
    }
    this.tickets.push(t)
    if (owner === this.user.id) this.addedThisHour++   // TicketService counts every message of theirs in the hour
    return t
  }
  /** Paths (with the query) answered 304 Not Modified, in order. */
  notModified: string[] = []
  /**
   * The bell's and the inbox first page's own ETag, as NotificationsController sends it ("n1-…": the person's inbox
   * version and the app): it moves whenever their list changes.
   */
  inboxTag(what: string): string {
    return `"n1-${etagOf(JSON.stringify(this.inbox) + what).replace(/"/g, '')}"`
  }

  /** The salon's booking window (its owner's setting, 1–30; GET /salons/{id} `maxDaysAhead`); undefined: not sent. */
  maxDaysAhead: number | undefined = 7
  calls: Call[] = []
  /** Saved places (PlacesController), as the backend keeps them: Home, Work, then others as saved. */
  places: Array<Record<string, any>> = []
  /** "Find on map": the answer for any address, or an error code to answer with. */
  geocodeAnswer: { latitude: number; longitude: number; precision: 'EXACT' | 'STREET' | 'AREA'; formattedAddress: string } = {
    latitude: 17.4651, longitude: 78.3644, precision: 'STREET', formattedAddress: 'Lake View Apartments, Kondapur, Hyderabad 500084',
  }
  geocodeError: { status: number; code: string; retryAfter?: number } | null = null
  /** The next new place is saved but its answer is lost on the way back. */
  loseNextAdd = false
  /** "Use current location": the address at any GPS point. */
  reverseAnswer = { addressLine: 'Lake View Apartments', area: 'Kondapur', city: 'Hyderabad', pincode: '500084', formattedAddress: 'Lake View Apartments, Kondapur, Hyderabad 500084' }
  bookings: Record<string, unknown>[] = []
  inbox: { id: string; type: string; title: string; body: string; url: string | null; sentAt: string; read: boolean }[] = []
  /** Start times (ISO) that answer 409 SLOT_TAKEN once. */
  takenOnce = new Set<string>()
  /** More free times ("HH:mm" on an India date), e.g. one starting within the hour. */
  extraTimes: { date: string; time: string }[] = []
  /** Start times (ISO) no longer offered. */
  gone = new Set<string>()
  /** Approved salons within 2 km, nearest first (BookingService.salonsNear). */
  /** GET /salons: SalonSummary records (the card fields optional here: a test's own list may leave them out). */
  salons: Array<Record<string, any>> = [
    card({
      id: 's1', name: SALON.name, area: SALON.area, city: SALON.city, distanceKm: 0.8, photoUrl: null, distanceMetres: 812.4,
      rating: { count: 12, average: 4.6, tags: [] },
      topServices: [{ name: 'Haircut', pricePaise: 20000, priceIsFrom: false }, { name: 'Beard trim', pricePaise: 10000, priceIsFrom: false }, { name: 'Hair colour', pricePaise: 80000, priceIsFrom: true }],
      serviceCount: 5,
      today: { weekday: 2, open: '00:00', close: '24:00' },
      openNow: true,
    }),
    card({ id: 's2', name: 'Royal Cuts', addressLine: 'Plot 4', area: 'Sector 63', city: 'Noida', distanceKm: 1.9, photoUrl: null, distanceMetres: 1934.7, rating: { count: 2, average: null, tags: [] }, topServices: [{ name: 'Haircut', pricePaise: 15000, priceIsFrom: false }], serviceCount: 1, openNow: false, closedToday: true, registered: false }),
  ]
  /** s1's closed days (holidays) in its booking window, yyyy-MM-dd */
  closedDates: string[] = []
  /** The salon this customer works in (owner, helper or barber), if any: its visits can't be rated (OWN_SALON). */
  worksAt: string | null = null
  /** GET /me/salon-preferences */
  comeBackReminders = true
  salonOffers = true
  /** s1's offers running or to come (SalonOfferResponses.OfferView), soonest first */
  offers: { id: string; percentOff: number; allServices: boolean; serviceIds: string[]; startsOn: string; endsOn: string; from: string | null; until: string | null }[] = []
  /** The customer completed a visit at s1 (then its page has the offer-messages switch), and stopped them or not */
  visitedS1 = false
  mutedS1 = false
  private refreshCount = 0
  private accessValid = new Set<string>()
  refreshTokens = new Map<string, 'live' | 'rotated' | 'revoked'>()
  /** Each swapped refresh token: when, and the one it was swapped for (for the refresh grace). */
  swaps = new Map<string, { at: number; successor: string }>()

  /** Refresh tokens the grace replaced (never reached their app), with when they were revoked. */
  graceReplaced = new Map<string, number>()
  /** How many refreshes the grace answered (a tab reloaded, or its answer lost, while its refresh was on the way). */
  graceUsed = 0

  /**
   * A new pair for a refresh token being swapped, remembering what it was swapped for. A grace swap keeps the first
   * swap's time: the grace counts from it (AuthService), it doesn't start again.
   */
  private rotate(old: string, at: number = Date.now()) {
    const pair = this.tokens()
    this.swaps.set(old, { at, successor: pair.refreshToken as string })
    return pair
  }
  /** Numbers with an account of their own (PHONE_IN_USE). */
  takenPhones = new Set<string>()
  /** Phone-change codes sent: new number → where the second went, wrong tries. Codes: 123456 (new number), 654321 (email), 111222 (current number). */
  phoneChangeCodes = new Map<string, { second: 'EMAIL' | 'PHONE'; phoneTries: number; secondTries: number }>()
  /** Phone-change sends today (5 at most, taken numbers included). */
  phoneChangeTries = 0
  /** The next phone change goes through but its answer is lost on the way back. */
  loseNextPhoneChange = false
  /** How many refreshes sent a token that had already been swapped (the backend would sign out everywhere). */
  reused = 0
  /** The next booking is refused with PROFILE_INCOMPLETE (the saved profile in the app was out of date). */
  profileIncompleteOnce = false
  /** Move targets (ISO) that answer SLOT_TAKEN once. */
  moveTakenOnce = new Set<string>()
  /** How many next-page requests fail (the earlier pages must stay on screen). */
  failSalonPages = 0
  /** The salon was suspended: its pages answer 404 SALON_NOT_FOUND. */
  salonGone = false
  /** Paths (by suffix) answered 503 SERVICE_BUSY with Retry-After this many times. */
  busy = new Map<string, { times: number; retryAfter: number }>()
  /** How many next-page requests of the past bookings fail with 500 (the pages shown must stay). */
  failPastPages = 0
  /**
   * Salon pages, service lists and free-time checks one person may ask in a minute (app.salon.reads-per-minute);
   * past it, 429 TOO_MANY_REQUESTS with Retry-After until the minute is over.
   */
  readsPerMinute = 60
  /** The salon reads counted in the current minute, and when that minute started. */
  salonReads: number[] = []
  /** Makes "sign out everywhere" fail on the backend. */
  failLogoutAll = false
  /** The next free-times read answers 429 (a refresh that fails: the 60-a-minute limit). */
  failSlotsOnce = false

  /** A signed-in, complete user, saved as the app saves it. */
  static completeUser(): MockUser {
    return { id: 'u1', phone: '9848012345', name: 'Riya Sharma', email: 'riya@example.com', emailVerified: true, admin: false }
  }

  private tokens() {
    this.refreshCount++
    const access = `access-${this.refreshCount}`
    const refresh = `refresh-${this.refreshCount}`
    this.accessValid.add(access)
    this.refreshTokens.set(refresh, 'live')
    return {
      accessToken: access,
      accessExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      refreshToken: refresh,
      refreshExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      user: this.user,
      newUser: this.user.name === null,
    }
  }

  /** Prepares a saved session for the app to pick up (as if the person signed in earlier). */
  savedSession(): string {
    const refresh = `refresh-saved-${++this.refreshCount}`
    this.refreshTokens.set(refresh, 'live')
    return JSON.stringify({ refreshToken: refresh, user: this.user })
  }

  /** A visit that ended an hour ago, still to be rated (for 14 days after it ended). */
  completedVisit(id = 'b9') {
    const start = Date.now() - 2 * 3600_000
    const b = { ...this.makeBooking(id, ['v1'], new Date(start).toISOString()), status: 'COMPLETED', startCode: null, canChange: false, canMove: false }
    b.rateUntil = new Date(start + 30 * 60_000 + 14 * 86400_000).toISOString()
    this.bookings.push(b)
    return b
  }

  booking(id: string) {
    return this.bookings.find((b) => b.id === id)
  }

  async attach(context: BrowserContext) {
    await context.route(`${API}/**`, async (route) => {
      try {
        await this.handle(route)
      } catch (e) {
        console.error('mock api failed on', route.request().method(), route.request().url(), e)
        await route.fulfill({ status: 500, body: JSON.stringify({ code: 'MOCK_FAILED', message: String(e) }) })
      }
    })
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: this.cors() })
    // Support files (photos and PDFs here, a video to the fake R2): before the body is read as JSON
    if (await this.ticketFiles.handle(route, url, method, this.user.id, this.cors())) return
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined
    const auth = req.headers()['authorization'] ?? null
    this.calls.push({ method, path: url.pathname + url.search, body, auth, idempotencyKey: req.headers()['idempotency-key'] ?? null, at: Date.now() })
    const p = url.pathname.replace('/api/v1', '')
    const ok = (status: number, json?: unknown, extra: Record<string, string> = {}, ownTag?: string) => {
      const text = json === undefined ? '' : JSON.stringify(json)
      // Every successful GET carries an ETag (the bell's and the inbox's first page the backend's own "n1-…"); sent
      // back unchanged as If-None-Match, the answer is 304 with no body
      const etag = method === 'GET' && status >= 200 && status < 300 ? (ownTag ?? etagOf(text)) : null
      if (etag && matches(req.headers()['if-none-match'], etag)) {
        this.notModified.push(url.pathname + url.search)
        return route.fulfill({ status: 304, headers: { ...this.cors(), ETag: etag }, body: '' })
      }
      return route.fulfill({
        status,
        headers: { ...this.cors(), 'Content-Type': 'application/json', ...(etag ? { ETag: etag } : {}), ...extra },
        body: text,
      })
    }
    const fail = (status: number, code: string, message: string, details: Record<string, unknown> = {}) =>
      ok(status, { code, message, details })

    // ---------- sign-in (public) ----------
    if (p === '/auth/otp/send') return ok(202)
    if (p === '/auth/otp/verify') {
      if (body.code === '999999') return fail(400, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.')
      if (body.code === '555555') return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong tries. Ask for a new code.')
      return body.code === '123456' ? ok(200, this.tokens()) : fail(400, 'WRONG_CODE', 'That code is not right. 4 tries left.')
    }
    if (p === '/auth/refresh') {
      const state = this.refreshTokens.get(body.refreshToken)
      if (state === 'rotated') {
        // AuthService.refresh's grace: swapped under 30 s ago and the token it was swapped for never used, it is the
        // app that reloaded (or lost the answer) while its refresh was on the way: a new pair, the unused one ends
        const swap = this.swaps.get(body.refreshToken)
        const since = swap ? Date.now() - swap.at : Infinity
        if (swap && since <= REFRESH_GRACE_MS && this.refreshTokens.get(swap.successor) === 'live') {
          this.graceUsed++
          this.refreshTokens.set(swap.successor, 'revoked')
          this.graceReplaced.set(swap.successor, Date.now())   // revoked now: its own grace counts from here
          return ok(200, this.rotate(body.refreshToken, swap.at))
        }
        // Within the retry time (60 s) it is the app retrying: "sign in again" on that device; later, a copy
        if (since <= RETRY_GRACE_MS) return fail(401, 'INVALID_REFRESH_TOKEN', 'Sign in again.')
        this.reused++
        return fail(401, 'REFRESH_TOKEN_REUSED', 'For your safety you were signed out everywhere. Sign in again.')
      }
      // GRACE_REPLACED: the pair the grace replaced, back after the grace: someone else had the token
      const replacedAt = this.graceReplaced.get(body.refreshToken)
      if (state === 'revoked' && replacedAt !== undefined && Date.now() - replacedAt > REFRESH_GRACE_MS) {
        this.reused++
        return fail(401, 'REFRESH_TOKEN_REUSED', 'For your safety you were signed out everywhere. Sign in again.')
      }
      if (state !== 'live') return fail(401, 'INVALID_REFRESH_TOKEN', 'Sign in again.')
      this.refreshTokens.set(body.refreshToken, 'rotated')
      return ok(200, this.rotate(body.refreshToken))
    }
    if (p === '/auth/logout') {
      // Signed out: the token ends ("sign in again" if it comes back), not a swap
      this.refreshTokens.set(body.refreshToken, 'revoked')
      return ok(204)
    }

    // ---------- everything else needs a valid access token ----------
    const token = auth?.replace('Bearer ', '') ?? ''
    if (!this.accessValid.has(token)) return fail(401, 'TOKEN_EXPIRED', 'Your session has expired. Refresh it.')

    // 503 SERVICE_BUSY with Retry-After, as GlobalExceptionHandler answers a statement past its time limit
    for (const [suffix, b] of this.busy) {
      if (p.endsWith(suffix) && b.times > 0) {
        b.times -= 1
        return ok(503, { code: 'SERVICE_BUSY', message: "We're having a short problem. Try again in a few seconds.", details: {} }, { 'Retry-After': String(b.retryAfter) })
      }
    }

    // ---------- changing the phone number (AuthService.sendPhoneChangeCode, changePhone), in its order ----------
    if (p === '/auth/me/phone/send-code') {
      const phone = normalize(body.newPhone)
      if (!phone) return fail(400, 'INVALID_PHONE', 'Enter a 10-digit Indian mobile number')
      if (phone === this.user.phone) return fail(400, 'SAME_PHONE', 'This is already your number.')
      if (++this.phoneChangeTries > 5) return fail(429, 'TOO_MANY_CODES', "You've asked for codes to change your number 5 times today. Try again tomorrow.")
      if (this.takenPhones.has(phone)) return fail(409, 'PHONE_IN_USE', 'This phone number already has its own account')
      // The second code: to the verified email, else to the number the account has now
      const toEmail = this.user.emailVerified
      this.phoneChangeCodes.set(phone, { second: toEmail ? 'EMAIL' : 'PHONE', phoneTries: 0, secondTries: 0 })
      return ok(200, toEmail
        ? { secondCodeTo: 'EMAIL', sentTo: `${this.user.email!.charAt(0)}***${this.user.email!.slice(this.user.email!.indexOf('@'))}` }
        : { secondCodeTo: 'PHONE', sentTo: `ending ${this.user.phone.slice(6)}` })
    }
    if (p === '/auth/me/phone') {
      if (!body.phoneCode || !body.secondCode) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { secondCode: 'must not be blank' })
      const phone = normalize(body.newPhone)
      if (!phone) return fail(400, 'INVALID_PHONE', 'Enter a 10-digit Indian mobile number')
      const sent = this.phoneChangeCodes.get(phone)
      if (!sent) return fail(400, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.')
      // Checked one after the other, each with its own tries: the new number's code, then the second code (looked for
      // where the account's second code goes now: none there if the email changed since the codes were sent)
      const check = (which: 'phoneTries' | 'secondTries', right: boolean) => {
        if (right) return null
        sent[which]++
        if (sent[which] >= 5) {
          this.phoneChangeCodes.delete(phone)
          return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes. Ask for a new one.')
        }
        return fail(400, 'WRONG_CODE', 'That code is not correct', { attemptsLeft: 5 - sent[which] })
      }
      const first = check('phoneTries', body.phoneCode === '123456')
      if (first) return first
      if ((sent.second === 'EMAIL') !== this.user.emailVerified) return fail(400, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.')
      const second = check('secondTries', body.secondCode === (sent.second === 'EMAIL' ? '654321' : '111222'))
      if (second) return second
      // Refused under the lock: the codes stay for another try
      if (this.takenPhones.has(phone)) return fail(409, 'PHONE_IN_USE', 'This phone number already has its own account')
      this.phoneChangeCodes.delete(phone)
      // Every earlier token ends (revoked: a refresh with one is refused, not reuse); this device gets a new pair
      for (const t of this.refreshTokens.keys()) this.refreshTokens.set(t, 'revoked')
      this.accessValid.clear()
      this.user = { ...this.user, phone }
      const tokens = this.tokens()
      if (this.loseNextPhoneChange) {
        this.loseNextPhoneChange = false
        return route.abort('connectionreset')
      }
      return ok(200, tokens)
    }
    if (p === '/auth/me' && method === 'GET') return ok(200, this.user)
    if (p === '/auth/me' && method === 'PATCH') {
      this.user = { ...this.user, name: body.name }
      return ok(200, this.user)
    }
    if (p === '/auth/email/send-code') return ok(202)
    if (p === '/auth/email/verify') {
      if (body.code !== '654321') return fail(400, 'WRONG_CODE', 'That code is not right.')
      this.user = { ...this.user, email: body.email, emailVerified: true }
      return ok(200, this.user)
    }
    // "Need help" (TicketService.ask): needs a verified email and a name; a message of 10 to 5,000 characters
    if (p === '/helpdesk/tickets' && method === 'POST') {
      if (!this.user.emailVerified || !this.user.name) {
        return fail(403, 'PROFILE_INCOMPLETE', 'Verify your email and tell us your name first.', {
          missing: [...(this.user.emailVerified ? [] : ['email']), ...(this.user.name ? [] : ['name'])],
        })
      }
      const text = String(body.message ?? '').trim()
      if (text.length < 10 || text.length > 5000) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { message: 'write 10 to 5000 characters' })
      const taken = this.ticketFiles.take(body.fileIds, this.user.id)
      if (!Array.isArray(taken)) return fail(taken.status, taken.code, taken.message)
      const t = this.newTicket(body.app, body.subject ?? null, text)
      t.messages[0].files = taken
      return ok(201, { id: t.id, number: t.number, sentTo: this.user.email })
    }
    // "My requests" (TicketService.mine / myTicket / addToMine): only this person's, newest activity first
    if (p === '/helpdesk/tickets' && method === 'GET') {
      const mine = this.tickets.filter((t) => t.owner === this.user.id)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).slice(0, 30)
      return ok(200, mine.map(myTicket))
    }
    const help = p.match(/^\/helpdesk\/tickets\/([^/]+)(\/messages)?$/)
    if (help) {
      const t = this.tickets.find((x) => x.id === help[1] && x.owner === this.user.id)
      if (!t) return fail(404, 'NOT_FOUND', 'Ticket not found')
      if (help[2] && method === 'POST') {
        const text = String(body.message ?? '').trim()
        const withFiles = Array.isArray(body.fileIds) && body.fileIds.length > 0
        if ((!withFiles && text.length < 2) || text.length > 5000) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { message: 'write 2 to 5000 characters' })
        // TicketService.addToMine: the same words, still the newest message and not resolved since: a repeat, kept once
        const last = t.messages[t.messages.length - 1]
        if (!withFiles && t.status !== 'RESOLVED' && last && !last.fromSupport && last.body === text) return ok(200, { ticket: myTicket(t), messages: t.messages })
        if (this.addedThisHour >= 20) return fail(429, 'TOO_MANY_MESSAGES', "You've written a lot in the last hour. We'll read those first.")
        const taken = this.ticketFiles.take(body.fileIds, this.user.id)
        if (!Array.isArray(taken)) return fail(taken.status, taken.code, taken.message)
        this.addedThisHour++
        const at = new Date().toISOString()
        t.messages.push({ seq: t.messages.length + 1, fromSupport: false, supportName: null, body: text, attachments: 0, at, files: taken })
        t.status = 'OPEN'
        t.lastMessageAt = at
      }
      return ok(200, { ticket: myTicket(t), messages: t.messages })
    }
    if (p === '/auth/logout-all') return this.failLogoutAll ? fail(503, 'SERVICE_BUSY', "We're having a short problem. Try again in a few seconds.") : ok(204)
    if (p === '/push/public-key') return ok(200, { publicKey: null })

    if (p === '/salons') {
      const lat = Number(url.searchParams.get('lat'))
      if (lat < 6 || lat > 37.6) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { lat: 'the point must be in India' })
      // Keyset pages of 30 after (distance, id), as the backend does
      const afterDistance = url.searchParams.get('afterDistance')
      const afterId = url.searchParams.get('afterId')
      if ((afterDistance === null) !== (afterId === null)) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { afterId: 'send afterDistance and afterId together' })
      if (afterDistance !== null && !Number.isFinite(Number(afterDistance))) return fail(400, 'BAD_REQUEST', 'The request is not valid')
      if (afterId !== null && this.failSalonPages > 0) {
        this.failSalonPages -= 1
        return fail(500, 'INTERNAL_ERROR', 'Something went wrong on our side.')
      }
      const rest = afterId === null ? this.salons : this.salons.filter((s) =>
        s.distanceMetres > Number(afterDistance) || (s.distanceMetres === Number(afterDistance) && s.id > afterId))
      return ok(200, rest.slice(0, 30))
    }
    // BookingService.requireReadsLeft: a salon page, its services and its free times count together, per person
    if (/^\/salons\/[^/]+(\/services|\/availability)?$/.test(p)) {
      const now = Date.now()
      this.salonReads = this.salonReads.filter((t) => now - t < 60_000)
      if (this.salonReads.length >= this.readsPerMinute) {
        const wait = Math.max(1, Math.ceil((this.salonReads[0] + 60_000 - now) / 1000))
        return ok(
          429,
          { code: 'TOO_MANY_REQUESTS', message: 'Too many salon pages at once. Wait a few seconds and try again.', details: {} },
          { 'Retry-After': String(wait) },
        )
      }
      this.salonReads.push(now)
    }
    if (p.startsWith('/salons/s1') && this.salonGone) return fail(404, 'SALON_NOT_FOUND', 'This salon is not on Apni Dukan right now.')
    if (p === '/salons/s1/offer-messages' && method === 'PUT') {
      this.mutedS1 = !body.on
      return ok(200, { on: body.on })
    }
    if (p === '/salons/s1') {
      return ok(200, { ...SALON, maxDaysAhead: this.maxDaysAhead, closedDates: this.closedDates, offers: this.offers, offerMessages: this.visitedS1 ? !this.mutedS1 : null })
    }
    if (p === '/salons/s1/services') {
      // BookingService.salonServices: each service's price in its best offer (running or to come)
      return ok(200, SERVICES.map((s) => {
        const best = this.offers.filter((o) => o.allServices || o.serviceIds.includes(s.id)).sort((a, b) => b.percentOff - a.percentOff)[0]
        return { ...s, offerPricePaise: best ? offerPriceOf(s.pricePaise, best.percentOff) : null }
      }))
    }
    if (p === '/salons/s1/availability') {
      if (this.failSlotsOnce) {
        this.failSlotsOnce = false
        return fail(429, 'TOO_MANY_REQUESTS', 'Too many salon pages at once. Wait a few seconds and try again.')
      }
      const date = url.searchParams.get('date')!
      const ids = url.searchParams.getAll('services')
      // BookingService.availability with moving: the customer's own booking at this salon (else 404), still able to
      // move (else 409 WRONG_STATUS), and the times are for its own booked length
      const movingId = url.searchParams.get('moving')
      const moving = movingId === null ? null : this.booking(movingId)
      if (movingId !== null && !moving) return fail(404, 'NOT_FOUND', 'No such booking.')
      if (moving && (moving.status !== 'CONFIRMED' || Date.parse(moving.startsAt as string) <= Date.now())) {
        return fail(409, 'WRONG_STATUS', "This booking can't be changed any more.")
      }
      const minutes = moving
        ? Math.round((Date.parse(moving.endsAt as string) - Date.parse(moving.startsAt as string)) / 60_000)
        : SERVICES.filter((s) => ids.includes(s.id)).reduce((t, s) => t + s.durationMinutes, 0)
      // BookingResponses.Slots: freeCancelMinutes (10) and each start's lateCancelFrom (1 hour before it)
      // Each start once, as the backend lists them (an extra time may also be a usual one, depending on the time of day)
      const times = [...new Set([...TIMES, ...this.extraTimes.filter((x) => x.date === date).map((x) => x.time)])].sort()
      const starts = times
        .map((t) => ({ startAt: istInstant(date, t), time: t }))
        .filter((s) => !this.gone.has(s.startAt))
        .map((s) => {
          // Slot.of: what the chosen services cost at this start, and without the offer when one applies
          const lines = this.priced(ids, date, s.time)
          const offer = lines.some((l) => l.listPricePaise !== null)
          return {
            ...s,
            lateCancelFrom: new Date(Date.parse(s.startAt) - LATE_CANCEL_MS).toISOString(),
            pricePaise: lines.reduce((t, l) => t + l.pricePaise, 0),
            listPricePaise: offer ? lines.reduce((t, l) => t + (l.listPricePaise ?? l.pricePaise), 0) : null,
          }
        })
      return ok(200, { date, durationMinutes: minutes, freeCancelMinutes: FREE_CANCEL_MINUTES, starts })
    }

    if (p === '/bookings' && method === 'POST') {
      if (this.profileIncompleteOnce) {
        this.profileIncompleteOnce = false
        this.user = { ...this.user, name: null }
        return fail(403, 'PROFILE_INCOMPLETE', 'Add your name first.', { missing: ['name'] })
      }
      // BookingService.book: at most 2 bookings not started yet (CONFIRMED and not over; one in the chair doesn't count)
      const active = this.bookings.filter((b) => b.status === 'CONFIRMED' && Date.parse(b.endsAt as string) > Date.now()).length
      if (active >= 2) return fail(409, 'TOO_MANY_BOOKINGS', 'You already have 2 upcoming bookings. Cancel one to book another.')
      if (this.takenOnce.has(body.startAt)) {
        this.takenOnce.delete(body.startAt)
        this.gone.add(body.startAt)
        return fail(409, 'SLOT_TAKEN', "That time isn't free any more. Pick one of the nearest free times.", { nearest: [] })
      }
      const booking = this.makeBooking(`b${this.bookings.length + 1}`, body.serviceIds, body.startAt)
      booking.earlierAlert = body.earlierAlert === true
      this.bookings.push(booking)
      this.inbox.unshift({ id: `n${this.inbox.length + 1}`, type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', body: `${SALON.name}, booked.`, url: `/bookings/${booking.id}`, sentAt: new Date().toISOString(), read: false })
      return ok(201, booking)
    }
    if (p === '/me/salon-preferences') {
      // Either or both; neither: 400 (BookingService.setPreferences)
      if (method === 'PUT') {
        if (body.comeBackReminders == null && body.salonOffers == null) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { comeBackReminders: 'send comeBackReminders, salonOffers or both' })
        if (body.comeBackReminders != null) this.comeBackReminders = body.comeBackReminders
        if (body.salonOffers != null) this.salonOffers = body.salonOffers
      }
      return ok(200, { comeBackReminders: this.comeBackReminders, salonOffers: this.salonOffers })
    }
    if (p === '/me/bookings') {
      // Spring reads the cursor first (one it can't read is 400 BAD_REQUEST, as handleTypeMismatch; an empty one
      // counts as not sent), then half of one is VALIDATION_FAILED naming afterId, then a cursor with when=upcoming
      // is VALIDATION_FAILED naming afterStart
      const upcoming = (url.searchParams.get('when') ?? 'upcoming').toLowerCase() !== 'past'
      const afterStart = url.searchParams.get('afterStart') || null
      const afterId = url.searchParams.get('afterId') || null
      const unreadable = (value: string, name: string) => fail(400, 'BAD_REQUEST', `'${value}' is not a valid value for '${name}'`)
      if (afterStart !== null && (!INSTANT.test(afterStart) || Number.isNaN(Date.parse(afterStart)))) return unreadable(afterStart, 'afterStart')
      if (afterId !== null && !BOOKING_ID.test(afterId)) return unreadable(afterId, 'afterId')
      const invalid = (details: Record<string, unknown>) => fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', details)
      if ((afterStart === null) !== (afterId === null)) return invalid({ afterId: 'send afterStart and afterId together' })
      if (upcoming && afterId !== null) return invalid({ afterStart: 'pages are only for when=past' })
      if (afterId !== null && this.failPastPages > 0) {
        this.failPastPages -= 1
        return fail(500, 'INTERNAL_ERROR', 'Something went wrong on our side.')
      }
      const at = (b: Record<string, unknown>) => micros(b.startsAt as string)
      const byId = (x: Record<string, unknown>, y: Record<string, unknown>) => ((x.id as string) < (y.id as string) ? -1 : (x.id as string) > (y.id as string) ? 1 : 0)
      // Upcoming: CONFIRMED or IN_SERVICE and not over yet, soonest first, all of them (at most 50)
      const waiting = (b: Record<string, unknown>) =>
        ['CONFIRMED', 'IN_SERVICE'].includes(b.status as string) && Date.parse(b.endsAt as string) > Date.now()
      if (upcoming) return ok(200, this.bookings.filter(waiting).sort((x, y) => at(x) - at(y) || byId(x, y)).slice(0, 50))
      // Past: everything else, startsAt descending then id ascending, 30 a page after the cursor
      const after = afterStart === null ? null : micros(afterStart)
      return ok(
        200,
        this.bookings
          .filter((b) => !waiting(b))
          .sort((x, y) => at(y) - at(x) || byId(x, y))
          .filter((b) => after === null || at(b) < after || (at(b) === after && (b.id as string) > afterId!))
          .slice(0, PAST_PAGE),
      )
    }
    const one = p.match(/^\/bookings\/([^/]+)(\/cancel|\/reschedule|\/earlier-alert|\/rating)?$/)
    if (one) {
      const b = this.booking(one[1])
      if (!b) return fail(404, 'NOT_FOUND', 'Booking not found')
      if (one[2] === '/cancel') {
        // BookingService.cancel: late after lateCancelFrom (at it, not)
        const late = Date.now() > Date.parse(b.lateCancelFrom as string)
        Object.assign(b, { status: 'CANCELLED_BY_CUSTOMER', startCode: null, canChange: false, canMove: false, cancelReason: 'Cancelled by you' })
        return ok(200, { booking: b, countedAsLate: late })
      }
      if (one[2] === '/earlier-alert' && method === 'PUT') {
        // BookingService.earlierAlert: on only while it can still be moved; off any time
        if (typeof body?.on !== 'boolean') return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { on: 'must not be null' })
        if (body.on && (b.status !== 'CONFIRMED' || new Date(b.startsAt as string).getTime() <= Date.now())) {
          return fail(409, 'WRONG_STATUS', "This booking can't be changed any more.")
        }
        if (body.on && new Date(b.startsAt as string).getTime() - Date.now() < 3600_000) {
          return fail(409, 'TOO_LATE_TO_MOVE', "Less than 1 hour to go: this booking can't be moved any more, so no earlier time can be offered.")
        }
        b.earlierAlert = body.on
        return ok(200, b)
      }
      if (one[2] === '/rating') {
        // BookingRequests.RateVisit (@Valid, checked first), then BookingService.rate in its order
        const invalid: Record<string, string> = {}
        if (!(body.stars >= 1 && body.stars <= 5)) invalid.stars = 'must be between 1 and 5'
        if ((body.tags ?? []).length > 5) invalid.tags = 'size must be between 0 and 5'
        if ((body.comment ?? '').length > 300) invalid.comment = 'size must be between 0 and 300'
        if (Object.keys(invalid).length) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', invalid)
        if (b.status !== 'COMPLETED') return fail(409, 'NOT_RATEABLE', "You can rate a visit once it's done.")
        if (!b.rateUntil || Date.parse(b.rateUntil as string) <= Date.now()) {
          return fail(409, 'RATING_CLOSED', "Visits can be rated for 14 days. This one can't be rated any more.")
        }
        if (this.worksAt === b.salonId) return fail(409, 'OWN_SALON', "You can't rate the salon you work in.")
        // TextCleaner: a comment needs at least 2 letters or digits
        if (body.comment && (body.comment.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) {
          return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { comment: 'must have at least 2 letters or digits' })
        }
        const now = new Date().toISOString()
        const order = ['ON_TIME', 'CLEAN', 'FRIENDLY', 'SKILLED', 'GOOD_VALUE']
        const before = b.rating as { ratedAt: string } | null
        b.rating = {
          stars: body.stars,
          tags: order.filter((t) => (body.tags ?? []).includes(t)),
          comment: body.comment?.trim() ? body.comment.trim() : null,
          ratedAt: before?.ratedAt ?? now,
          updatedAt: now,
        }
        return ok(200, b)
      }
      if (one[2] === '/reschedule') {
        // BookingService.requireInWindow: the salon's notice (30 minutes here)
        if (new Date(body.startAt).getTime() < Date.now() + 30 * 60_000) {
          return fail(400, 'OUTSIDE_WINDOW', 'That time is too soon or too far ahead for this salon.')
        }
        if (this.moveTakenOnce.has(body.startAt)) {
          this.moveTakenOnce.delete(body.startAt)
          this.gone.add(body.startAt)
          return fail(409, 'SLOT_TAKEN', "That time isn't free any more. Pick one of the nearest free times.", { nearest: [] })
        }
        // Moving keeps the row (its createdAt and its earlier-slot switch), so lateCancelFrom is worked out from the
        // original booking time
        Object.assign(b, { ...this.makeBooking(b.id as string, (b.services as { serviceId: string }[]).map((s) => s.serviceId), body.startAt, b.createdAt as string), earlierAlert: b.earlierAlert })
        return ok(200, b)
      }
      return ok(200, b)
    }

    if (p === '/me/notifications') {
      // Newest first, 30 a page; `next` is an opaque cursor (here "c" and the index), anything else 400 BAD_CURSOR
      const cursor = url.searchParams.get('cursor')
      if (cursor !== null && !/^c\d+$/.test(cursor)) return fail(400, 'BAD_CURSOR', 'This list has changed. Open it again.')
      const from = cursor === null ? 0 : Number(cursor.slice(1))
      const next = from + INBOX_PAGE < this.inbox.length ? `c${from + INBOX_PAGE}` : null
      return ok(200, { items: this.inbox.slice(from, from + INBOX_PAGE), unread: Math.min(100, this.inbox.filter((i) => !i.read).length), next }, {}, cursor === null ? this.inboxTag('list') : undefined)
    }
    if (p === '/me/notifications/unread-count') return ok(200, { unread: Math.min(100, this.inbox.filter((i) => !i.read).length) }, {}, this.inboxTag('count'))
    // ---------- saved places (PlacesController, PlaceService), in the backend's order of checks ----------
    if (p === '/me/places/geocode' || p === '/me/places/reverse-geocode') {
      // @Valid first, then the search (GEOCODING_OFF and the limits)
      if (p === '/me/places/reverse-geocode') {
        if (!(body.latitude >= 6 && body.latitude <= 37.6)) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { latitude: 'must be less than or equal to 37.6' })
        if (!(body.longitude >= 68 && body.longitude <= 97.5)) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { longitude: 'must be less than or equal to 97.5' })
      } else {
        const bad = sizeErrors(body)
        if (Object.keys(bad).length) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', bad)
      }
      if (this.geocodeError) {
        const { status, code, retryAfter } = this.geocodeError
        return ok(status, { code, message: 'Address search failed', details: {} }, retryAfter ? { 'Retry-After': String(retryAfter) } : {})
      }
      return ok(200, p === '/me/places/geocode' ? this.geocodeAnswer : this.reverseAnswer)
    }
    const view = (x: Record<string, any>) => {
      const { createdAt: _created, ...rest } = x
      void _created
      return rest
    }
    if (p === '/me/places' && method === 'GET') {
      const order = { HOME: 0, WORK: 1, OTHER: 2 } as Record<string, number>
      return ok(200, [...this.places].sort((a, b) => order[a.kind] - order[b.kind] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(view))
    }
    if ((p === '/me/places' && method === 'POST') || (/^\/me\/places\/[^/]+$/.test(p) && (method === 'PUT' || method === 'DELETE'))) {
      const id = p === '/me/places' ? null : decodeURIComponent(p.slice('/me/places/'.length))
      // A path id that isn't a UUID: the type-mismatch handler
      if (id !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return fail(400, 'BAD_REQUEST', 'The request is not valid')
      if (method === 'DELETE') {
        this.places = this.places.filter((x) => x.id !== id)
        return ok(204)
      }
      // 1. @Valid (each field's own key); 2. an Other's name; 3. TextCleaner; then 404, the limit, Home/Work
      const bad = sizeErrors(body)
      if (!['HOME', 'WORK', 'OTHER'].includes(body.kind)) bad.kind = 'must not be null'
      if (!/^[1-9][0-9]{5}$/.test(body.pincode ?? '')) bad.pincode = 'must be a 6-digit pincode'
      if (!(body.latitude >= 6 && body.latitude <= 37.6)) bad.latitude = 'must be less than or equal to 37.6'
      if (!(body.longitude >= 68 && body.longitude <= 97.5)) bad.longitude = 'must be less than or equal to 97.5'
      if (Object.keys(bad).length) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', bad)
      if (body.kind === 'OTHER' && !(body.name ?? '').trim()) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { name: 'give this place a name' })
      const cleaned: Record<string, string> = {}
      for (const [field, min, max] of [['name', 2, 30], ['addressLine', 2, 200], ['area', 2, 100], ['city', 2, 60]] as const) {
        if (field === 'name' && body.kind !== 'OTHER') continue
        const v = String(body[field]).normalize('NFKC').replace(/\s+/g, ' ').trim()
        if ((v.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { [field]: 'must have at least 2 letters or digits' })
        if (v.length < min || v.length > max) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { [field]: `must be ${min} to ${max} characters` })
        cleaned[field] = v
      }
      const old = id ? this.places.find((x) => x.id === id) : undefined
      if (id && !old) return fail(404, 'PLACE_NOT_FOUND', "That place isn't saved any more.")
      if (!id && this.places.length >= 10) return fail(409, 'TOO_MANY_PLACES', "You can save up to 10 places. Delete one you don't use, then add this one.", { max: 10 })
      const holder = body.kind !== 'OTHER' && this.places.find((x) => x.kind === body.kind && x.id !== id)
      if (holder) {
        const what = body.kind === 'HOME' ? 'Home' : 'Work'
        return fail(409, 'PLACE_KIND_TAKEN', `You already have a ${what} address. Change that one, or save this as another place.`, { placeId: holder.id })
      }
      const now = new Date().toISOString()
      const saved = {
        id: id ?? crypto.randomUUID(),
        kind: body.kind,
        name: body.kind === 'OTHER' ? cleaned.name : null,
        addressLine: cleaned.addressLine, area: cleaned.area, city: cleaned.city, pincode: body.pincode,
        latitude: Math.round(body.latitude * 1e6) / 1e6, longitude: Math.round(body.longitude * 1e6) / 1e6,
        updatedAt: now, createdAt: old?.createdAt ?? now,
      }
      if (old) Object.assign(old, saved)
      else this.places.push(saved)
      // Saved, but the answer never reaches the phone
      if (!id && this.loseNextAdd) {
        this.loseNextAdd = false
        return route.abort('connectionreset')
      }
      return ok(id ? 200 : 201, view(saved))
    }
    if (p.startsWith('/tiles/')) return route.fulfill({ status: 404, body: '' })
    if (p === '/me/notifications/read') {
      const ids: string[] = body?.ids ?? []
      this.inbox.forEach((i) => {
        if (!ids.length || ids.includes(i.id)) i.read = true
      })
      return ok(204)
    }

    return fail(404, 'NOT_FOUND', `No mock for ${method} ${p}`)
  }

  /** SalonOffer.price: the services at this India date and time, each covered one at its best offer's price. */
  priced(serviceIds: string[], date: string, time: string) {
    const live = this.offers.filter((o) => date >= o.startsOn && date <= o.endsOn && (!o.from || (time >= o.from && time < o.until!)))
    return SERVICES.filter((s) => serviceIds.includes(s.id)).map((s) => {
      const best = live.filter((o) => o.allServices || o.serviceIds.includes(s.id)).sort((a, b) => b.percentOff - a.percentOff)[0]
      return { serviceId: s.id, name: s.name, durationMinutes: s.durationMinutes, pricePaise: best ? offerPriceOf(s.pricePaise, best.percentOff) : s.pricePaise, priceIsFrom: s.priceIsFrom, listPricePaise: best ? s.pricePaise : null }
    })
  }

  makeBooking(id: string, serviceIds: string[], startAt: string, createdAt: string = new Date().toISOString()) {
    const ist = new Date(Date.parse(startAt) + IST).toISOString()
    const lines = this.priced(serviceIds, ist.slice(0, 10), ist.slice(11, 16))
    const start = new Date(startAt).getTime()
    const minutes = lines.reduce((t, l) => t + l.durationMinutes, 0)
    const movable = start - Date.now() >= 3600_000
    return {
      id,
      bookingNo: 'K7M2QX',
      salonId: 's1',
      salonName: SALON.name,
      salonAddress: `${SALON.addressLine}, ${SALON.area}, ${SALON.city} ${SALON.pincode}`,
      mapLink: SALON.mapLink,
      services: lines,
      totalPricePaise: lines.reduce((t, l) => t + l.pricePaise, 0),
      totalListPricePaise: lines.some((l) => l.listPricePaise !== null) ? lines.reduce((t, l) => t + (l.listPricePaise ?? l.pricePaise), 0) : null,
      priceIsFrom: lines.some((l) => l.priceIsFrom),
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + minutes * 60_000).toISOString(),
      heldUntil: new Date(start + 10 * 60_000).toISOString(),
      status: 'CONFIRMED',
      startCode: '4821',
      cancelReason: null,
      canChange: start > Date.now(),
      canMove: movable,
      createdAt,
      // BookingService.lateCancelFrom: the later of 1 hour before the start and 10 minutes after booking
      lateCancelFrom: new Date(Math.max(start - LATE_CANCEL_MS, Date.parse(createdAt) + FREE_CANCEL_MINUTES * 60_000)).toISOString(),
      earlierAlert: false as boolean,
      rating: null as Record<string, unknown> | null,
      rateUntil: null as string | null,
    }
  }

  private cors() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, If-None-Match',
      'Access-Control-Expose-Headers': 'Retry-After, ETag',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    }
  }
}
