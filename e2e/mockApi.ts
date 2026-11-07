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

export class MockApi {
  user: MockUser = { id: 'u1', phone: '9848012345', name: null, email: null, emailVerified: false, admin: false }
  /** Paths (with the query) answered 304 Not Modified, in order. */
  notModified: string[] = []
  /**
   * The bell's and the inbox first page's own ETag, as NotificationsController sends it ("n1-…": the person's inbox
   * version and the app): it moves whenever their list changes.
   */
  inboxTag(what: string): string {
    return `"n1-${etagOf(JSON.stringify(this.inbox) + what).replace(/"/g, '')}"`
  }

  /** The salon's booking window (its owner's setting, 1–30; GET /salons/{id} `maxDaysAhead`). */
  maxDaysAhead = 7
  calls: Call[] = []
  bookings: Record<string, unknown>[] = []
  inbox: { id: string; type: string; title: string; body: string; url: string | null; sentAt: string; read: boolean }[] = []
  /** Start times (ISO) that answer 409 SLOT_TAKEN once. */
  takenOnce = new Set<string>()
  /** More free times ("HH:mm" on an India date), e.g. one starting within the hour. */
  extraTimes: { date: string; time: string }[] = []
  /** Start times (ISO) no longer offered. */
  gone = new Set<string>()
  /** Approved salons within 2 km, nearest first (BookingService.salonsNear). */
  salons = [
    { id: 's1', name: SALON.name, area: SALON.area, city: SALON.city, distanceKm: 0.8, photoUrl: null, distanceMetres: 812.4 },
    { id: 's2', name: 'Royal Cuts', area: 'Sector 63', city: 'Noida', distanceKm: 1.9, photoUrl: null, distanceMetres: 1934.7 },
  ]
  private refreshCount = 0
  private accessValid = new Set<string>()
  refreshTokens = new Map<string, 'live' | 'rotated'>()
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
        this.reused++
        return fail(401, 'REFRESH_TOKEN_REUSED', 'For your safety you were signed out everywhere. Sign in again.')
      }
      if (state !== 'live') return fail(401, 'INVALID_REFRESH_TOKEN', 'Sign in again.')
      this.refreshTokens.set(body.refreshToken, 'rotated')
      return ok(200, this.tokens())
    }
    if (p === '/auth/logout') {
      this.refreshTokens.set(body.refreshToken, 'rotated')
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
    if (p === '/salons/s1') return ok(200, { ...SALON, maxDaysAhead: this.maxDaysAhead })
    if (p === '/salons/s1/services') return ok(200, SERVICES)
    if (p === '/salons/s1/availability') {
      const date = url.searchParams.get('date')!
      const ids = url.searchParams.getAll('services')
      const minutes = SERVICES.filter((s) => ids.includes(s.id)).reduce((t, s) => t + s.durationMinutes, 0)
      // BookingResponses.Slots: freeCancelMinutes (10) and each start's lateCancelFrom (1 hour before it)
      // Each start once, as the backend lists them (an extra time may also be a usual one, depending on the time of day)
      const times = [...new Set([...TIMES, ...this.extraTimes.filter((x) => x.date === date).map((x) => x.time)])].sort()
      const starts = times
        .map((t) => ({ startAt: istInstant(date, t), time: t }))
        .filter((s) => !this.gone.has(s.startAt))
        .map((s) => ({ ...s, lateCancelFrom: new Date(Date.parse(s.startAt) - LATE_CANCEL_MS).toISOString() }))
      return ok(200, { date, durationMinutes: minutes, freeCancelMinutes: FREE_CANCEL_MINUTES, starts })
    }

    if (p === '/bookings' && method === 'POST') {
      if (this.profileIncompleteOnce) {
        this.profileIncompleteOnce = false
        this.user = { ...this.user, name: null }
        return fail(403, 'PROFILE_INCOMPLETE', 'Add your name first.', { missing: ['name'] })
      }
      if (this.takenOnce.has(body.startAt)) {
        this.takenOnce.delete(body.startAt)
        this.gone.add(body.startAt)
        return fail(409, 'SLOT_TAKEN', "That time isn't free any more. Pick one of the nearest free times.", { nearest: [] })
      }
      const booking = this.makeBooking(`b${this.bookings.length + 1}`, body.serviceIds, body.startAt)
      this.bookings.push(booking)
      this.inbox.unshift({ id: `n${this.inbox.length + 1}`, type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', body: `${SALON.name}, booked.`, url: `/bookings/${booking.id}`, sentAt: new Date().toISOString(), read: false })
      return ok(201, booking)
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
    const one = p.match(/^\/bookings\/([^/]+)(\/cancel|\/reschedule)?$/)
    if (one) {
      const b = this.booking(one[1])
      if (!b) return fail(404, 'NOT_FOUND', 'Booking not found')
      if (one[2] === '/cancel') {
        // BookingService.cancel: late after lateCancelFrom (at it, not)
        const late = Date.now() > Date.parse(b.lateCancelFrom as string)
        Object.assign(b, { status: 'CANCELLED_BY_CUSTOMER', startCode: null, canChange: false, canMove: false, cancelReason: 'Cancelled by you' })
        return ok(200, { booking: b, countedAsLate: late })
      }
      if (one[2] === '/reschedule') {
        if (this.moveTakenOnce.has(body.startAt)) {
          this.moveTakenOnce.delete(body.startAt)
          this.gone.add(body.startAt)
          return fail(409, 'SLOT_TAKEN', "That time isn't free any more. Pick one of the nearest free times.", { nearest: [] })
        }
        // Moving keeps the row (its createdAt), so lateCancelFrom is worked out from the original booking time
        Object.assign(b, this.makeBooking(b.id as string, (b.services as { serviceId: string }[]).map((s) => s.serviceId), body.startAt, b.createdAt as string))
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
    if (p === '/me/notifications/read') {
      const ids: string[] = body?.ids ?? []
      this.inbox.forEach((i) => {
        if (!ids.length || ids.includes(i.id)) i.read = true
      })
      return ok(204)
    }

    return fail(404, 'NOT_FOUND', `No mock for ${method} ${p}`)
  }

  makeBooking(id: string, serviceIds: string[], startAt: string, createdAt: string = new Date().toISOString()) {
    const lines = SERVICES.filter((s) => serviceIds.includes(s.id)).map((s) => ({ serviceId: s.id, name: s.name, durationMinutes: s.durationMinutes, pricePaise: s.pricePaise, priceIsFrom: s.priceIsFrom }))
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
      priceIsFrom: lines.some((l) => l.priceIsFrom),
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + minutes * 60_000).toISOString(),
      heldUntil: new Date(start + 15 * 60_000).toISOString(),
      status: 'CONFIRMED',
      startCode: '4821',
      cancelReason: null,
      canChange: start > Date.now(),
      canMove: movable,
      createdAt,
      // BookingService.lateCancelFrom: the later of 1 hour before the start and 10 minutes after booking
      lateCancelFrom: new Date(Math.max(start - LATE_CANCEL_MS, Date.parse(createdAt) + FREE_CANCEL_MINUTES * 60_000)).toISOString(),
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
