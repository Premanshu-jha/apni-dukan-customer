# Clozest — customer app

The app customers use to find a salon near them and book a time. It is a mobile-first web app (it can be
added to the phone's home screen) and talks only to [apni-dukan-backend](https://github.com/Premanshu-jha/apni-dukan-backend).

Home lists the salons near the customer. Categories (like Swiggy's Food and Instamart) show only once open
(`CATEGORIES` in `src/features/home/categories.ts`, `live`): today only **Salon** is, so there are no tabs; **Kirana** and
**Services** are hidden until they open. Shop owners and the field team use separate apps (partner and admin), not
this one.

## Run it on your laptop

You need Node 22 and the backend running (on your laptop at `http://localhost:8080`, or on Railway).

```bash
npm install
cp .env.example .env.local     # then edit the two values
npm run dev                    # http://localhost:5173
```

| Setting | What it is | Example |
| --- | --- | --- |
| `VITE_API_URL` | The backend's address, no trailing slash | `http://localhost:8080` or `https://apni-dukan-backend-production.up.railway.app` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile **site** key (public). Leave empty when the backend has no `TURNSTILE_SECRET_KEY` | `0x4AAAAAAA…` |
| `VITE_SUPPORT_EMAIL` | The support address shown under "Need help" (Profile and the form). Default `support@clozest.in` | `support@clozest.in` |
| `VITE_MAP_TILES` | Map tiles for a saved place's pin. Default OpenStreetMap's, fine for low traffic (see its tile policy) | empty |

All are public values baked into the page at build time. No secret ever goes in this app.

The backend must allow this app's address in `CORS_ALLOWED_ORIGINS` (it already allows `http://localhost:5173`).

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright): a real browser drives the app against a fake backend |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run icons` | Make the PNG icons from `public/icon.svg` (commit them) |

CI runs type-check, lint, unit tests, build, the end-to-end tests, the security-headers check (Caddy), `npm audit`
(high and critical) and a gitleaks secret scan on every pull request. Dependabot proposes npm and GitHub Actions
updates weekly.

### Tests

Every situation a customer can run into is listed in [`docs/scenarios.md`](docs/scenarios.md): the journey, what
the backend answers, what the screen shows, and which test proves it. New work adds or updates rows there, and
reviews walk the list against the code.

- **Unit tests** (`src/**/*.test.ts`): India time, money, phone numbers, the profile steps, the booking draft, and
  the API client (one shared refresh, the newest saved token, a refresh landing after sign-out, busy retry, error
  codes).
- **End-to-end tests** (`e2e/`): Playwright on a phone-sized Chromium, against `e2e/mockApi.ts`, a fake backend
  whose answers follow the backend's records and error codes (`.env.e2e` points the app at it). Journeys: sign-up
  to booking, blocked location, a time taken by someone else, move and cancel, a late cancel, messages, sign-out
  and the next person, two tabs sharing one session, a failed "sign out everywhere", a removed service in a saved
  draft. A failed run in CI keeps its traces as an artifact.

## Screens

Everything needs sign-in, because the backend's salon endpoints need a signed-in session. The guards in
`src/app/guards.tsx` send people to the right step.

| Route | Screen | Backend calls (`/api/v1/…`) |
| --- | --- | --- |
| `/signin` | Mobile number + robot check | `POST auth/otp/send` |
| `/signin/code` | 6-digit SMS code, resend after 30 s | `POST auth/otp/verify` |
| `/signin/recover` | Lost phone: email + new number, a code to each | `POST auth/recover/start`, `auth/recover/complete` |
| `/welcome/email` | Step 2 of 3: email and its code | `POST auth/email/send-code`, `auth/email/verify` |
| `/welcome/name` | Step 3 of 3, last: "What should we call you?" | `PATCH auth/me` |
| `/` | Home: "Good morning/afternoon/evening, {first name}" (India time); the next booking ("Your booking") and "Want to book again?" → Book now; then location and salons within 2 km, 30 at a time ("Show more salons") | `GET salons?lat&lng[&afterDistance&afterId]`, `me/bookings?when=upcoming` (and `when=past`, first page, only when nothing is coming up) |
| `/salons/:id` | Salon: photo, address, offers (and its offer-messages switch once visited), services to tick (with offer prices), opening hours; `?offer=` picks the offer's services | `GET salons/{id}`, `salons/{id}/services`, `PUT salons/{id}/offer-messages` |
| `/salons/:id/book` | Day chips (7 days) and free times, each with when the visit would end ("10:00 AM to 10:30 AM") | `GET salons/{id}/availability?services&date` |
| `/salons/:id/confirm` | Summary and Book now | `POST bookings` (with `Idempotency-Key`) |
| `/bookings` | Upcoming / Past | `GET me/bookings?when=` |
| `/bookings/:id` | Start code, arrive-by time, services, Move, Cancel, notifications offer | `GET bookings/{id}`, `POST bookings/{id}/cancel` |
| `/bookings/:id/move` | New day and time | `POST bookings/{id}/reschedule` |
| `/notifications` | Messages: newest first, unread marked, tap to open the booking, Mark all read, Show older | `GET me/notifications?app=customer`, `POST me/notifications/read` |
| `/profile` | Name, mobile, email, notifications switch, come-back reminders and offers switches, help email, sign out, sign out everywhere | `PATCH auth/me`, `PUT me/salon-preferences`, `POST auth/logout`, `auth/logout-all` |
| `/profile/email` | Change email (SMS code first when the old email is verified) | `POST auth/email/change-phone-code`, `auth/email/send-code`, `auth/email/verify` |
| `/profile/delete` | Delete account with an SMS code | `POST auth/me/delete-code`, `auth/me/delete` |

## Flows

### Sign-up and sign-in

Who goes where: the route guards (`src/app/guards.tsx`) and `nextAfterSignIn` (`src/features/auth/flow.ts`).

```mermaid
flowchart TD
  open([Open the app]) --> saved{Saved session?}
  saved -- no --> phone["/signin: mobile number + robot check"]
  saved -- yes --> refresh[Refresh the session]
  refresh -- refused --> phone
  refresh -- ok --> done{Email and name done?}
  phone -- "otp/send 202" --> code["/signin/code: 6-digit SMS code"]
  phone -- "SMS_PAUSED / CAPTCHA_*" --> phone
  phone -. lost phone .-> recover["/signin/recover: email + new number, a code to each"]
  recover -- both codes right --> done
  code -- "WRONG_CODE / CODE_EXPIRED / TOO_MANY_ATTEMPTS" --> code
  code -- "verify 200" --> done
  done -- email missing --> email["/welcome/email: email, then its code"]
  email --> done
  done -- name missing --> name["/welcome/name: What should we call you?"]
  name --> done
  done -- yes --> back([Back to where they started, or Home])
```

### Finding a salon and booking

`LocationGate`, `SalonList`, `SalonPage`, `BookTime`, `ConfirmBooking`. Every backend answer on Book has its own
branch; the Idempotency-Key in the draft means a retried tap never books twice.

```mermaid
flowchart TD
  home([Home: Salon tab]) --> loc{Location?}
  loc -- "not asked yet" --> explain[Why we need it → Allow location]
  explain --> loc
  loc -- blocked or off --> guide[Step-by-step guide → Try again]
  guide --> loc
  loc -- outside India --> india[Clozest works only in India]
  loc -- ok --> list[Salons within 2 km]
  list -- none --> empty[No salons near you yet → Let us know]
  list --> salon["/salons/:id: tick services"]
  salon --> time["/salons/:id/book: day chips, free times"]
  time --> confirm["/salons/:id/confirm: Book now + Idempotency-Key"]
  confirm -- 201 --> booked([Booking with start code])
  confirm -- SLOT_TAKEN --> time
  confirm -- PROFILE_INCOMPLETE --> step[Missing sign-up step] --> confirm
  confirm -- "BOOKING_BLOCKED / TOO_MANY_BOOKINGS / TOO_MANY_CHANGES / OVERLAPS_YOUR_BOOKING" --> msg[Banner: the reason, e.g. when booking opens again]
  confirm -- "network timeout, retried" --> same[Same key: never two bookings]
```

### A booking's life

What the customer sees on `/bookings/:id` (`BookingDetail`). Move is offered only while `canMove` is true (more than
1 hour to go and the salon taking changes); Cancel while `canChange` is true.

```mermaid
stateDiagram-v2
  [*] --> CONFIRMED: booked
  CONFIRMED --> CONFIRMED: moved (more than 1 h before)
  CONFIRMED --> CANCELLED_BY_CUSTOMER: cancelled (within 1 h = late, a strike)
  CONFIRMED --> CANCELLED_BY_SALON: salon cancels, with a reason
  CONFIRMED --> IN_SERVICE: salon starts it with the 4-digit code
  CONFIRMED --> CONFIRMED: moved to an earlier time it was offered (switch on, someone cancelled)
  CONFIRMED --> NO_SHOW: not started 10 min after the start (a strike)
  IN_SERVICE --> COMPLETED: done
  COMPLETED --> [*]
  CANCELLED_BY_CUSTOMER --> [*]
  CANCELLED_BY_SALON --> [*]
  NO_SHOW --> [*]
```

### Staying signed in (several tabs)

`src/api/client.ts` and `src/store/session.ts`.

```mermaid
sequenceDiagram
  participant Tab as A tab of the app
  participant Lock as Lock shared by all tabs
  participant Saved as Saved session (localStorage)
  participant API as Backend
  Tab->>API: call with access token
  API-->>Tab: 401 (expired)
  Tab->>Lock: one refresh at a time
  Lock->>Saved: read the newest refresh token
  Tab->>API: POST /auth/refresh
  alt new pair
    API-->>Tab: tokens
    Tab->>Saved: save (other tabs follow by storage event)
    Tab->>API: the call again
  else refused (expired, reused, account gone)
    API-->>Tab: 401
    Tab->>Saved: sign out here, drop push, draft and cache
  end
  Note over Tab,API: Signing out waits for a refresh on its way, and one landing after sign-out is thrown away
```

## How it works

### Folders

```
src/
  app/          routes (App.tsx), guards, shell with the bottom bar
  api/          client.ts (fetch, refresh, retries), errors.ts, types.ts, one file per backend area
  features/     auth, home, location, salon, bookings, profile — one folder per part of the app
  components/   Button, Field, Card, Banner, Sheet, Chip, CodeInput, Turnstile
  store/        session, location, booking draft (Zustand)
  lib/          India time, money, phone, storage, device name, config
public/         sw.js (push notifications), manifest, icon
```

### Sign-in and the session

- Sign-up order: phone code → email code → name (asked last). `missingSteps()` in `store/session.ts` decides what
  is still needed; the backend refuses bookings with `403 PROFILE_INCOMPLETE` until all three are done.
- The **access token** (15 minutes) is kept in memory only. The **refresh token** and the user are saved in
  `localStorage` (`ad.session`) so a reload keeps the person signed in.
- `api/client.ts`: any 401 → one refresh → the request again. Requests that hit an expired token at the same time
  share one refresh. A refused refresh signs the person out; a network blip doesn't.
- `SERVICE_BUSY` (503) → wait `Retry-After` (at most 5 s) and try once more, only for reads and for calls with an
  `Idempotency-Key`.
- **Several tabs:** all tabs share the saved refresh token. A refresh takes a lock shared by the tabs
  (`navigator.locks`) and reads the newest saved token inside it, and each tab follows the others through `storage`
  events. Without this, a second tab would send an already-swapped token, which the backend treats as theft and
  answers by signing the person out everywhere (`REFRESH_TOKEN_REUSED`).
- **Signing out while a refresh is on its way:** sign-out waits for it, and a refresh that still lands afterwards
  is thrown away (its new token is signed out too), so the session never comes back by itself.
- **When the backend ends the session** (expired, signed out everywhere, account deleted on another device), this
  browser drops its notification subscription, the booking draft, cached data and the saved return path.
- A device name ("Chrome on Android · 4f2a") is made once and sent with sign-in and refresh.
- Known trade-off for now: a refresh token in `localStorage` can be read by a script injected into the page. Before
  launch it can move to an HttpOnly cookie (needs a small backend change).

### Location and nearby salons

- Salons are found near the phone's location, or near a saved place. Before the browser's Allow/Block prompt the app
  explains why. If location is blocked or off, a guide shows the steps for Android, iPhone or a computer, and "Or
  enter an address" leads to the saved places.
- The location is saved on the phone (`ad.location`) and shown as "Near your current location · ±30 m · Update ·
  Change", with the address there underneath ("Lake View Apartments, Kondapur"), from
  `POST /me/places/reverse-geocode` (the point rounded to 3 decimals). Sparing with Google lookups: within 300 m of
  the last point looked up its words are shown again, and Home looks up at most 3 times a day, so the person's own
  10 a day stay for setting places. Kept on the phone (`ad.locationAddress`, forgotten on sign-out). Not shown for a
  point worse than 1 km, or when the search is off or used up.
- **Saved places** (`/places`, also Profile → Saved addresses): Home, Work and others with a name, up to 10, kept on
  the backend (`/api/v1/me/places`). Each is set like a salon's address in the partner app: the four fields typed,
  then "Find on map", or "Use current location" (the pin at the GPS point, empty fields filled from the address
  there); then the pin is dragged (or the map tapped) onto the building. The map is Leaflet with OpenStreetMap tiles
  (`VITE_MAP_TILES`).
- Picking a place keeps a copy of it on the phone (`ad.chosenPlace`) and Home shows "Near Home · Flat 4B, …". Home
  reads the saved list and follows a change to the picked place, or goes back to the current location when it was
  deleted (here or on another phone). Signing out forgets both.
- Accuracy worse than 1 km (usual on laptops) shows a warning that results may be off.
- The backend returns approved salons within 2 km, nearest first, 30 at a time (found by a map index, so a dense
  city is as fast as a quiet one). "Show more salons" asks for the next 30 after the last one's distance and id,
  until a shorter page comes back. None → "No salons near you yet" with "Let us know", which opens Need help with
  the subject and the location filled in.

### Booking

- The draft (salon, services, day, time, idempotency key) is saved on the phone (`ad.draft`), so a reload keeps it.
- Changing the services clears the chosen time (a different length of booking needs a different slot).
- Book sends an `Idempotency-Key`; a retried tap never makes two bookings. A new key is made after any final answer.
- A draft saved on an earlier day keeps its services but drops a day or time that has passed.
- `IDEMPOTENCY_KEY_REUSED` (an earlier try whose answer never arrived may have booked) → "Check My bookings", and a
  new key for the next try.
- `SLOT_TAKEN` (booking or moving) refreshes that salon's free times, then → back to the time screen with "Someone just booked that time". `TOO_MANY_BOOKINGS` (2 upcoming) links
  to My bookings. Other errors show the backend's own message.
- All times are shown in India time (`lib/ist.ts`), whatever zone the phone is set to.
- **Each free time shows when the visit ends:** the start, and under it "to 10:30 AM" (the start plus the minutes of
  the services picked, `durationMinutes` in the availability answer), on Pick a time; on Move, the booking's own
  length (what the move keeps).
- **Coming back after booking (Home):** the heading "Good morning / afternoon / evening, Riya" by the clock in India
  (before noon, until 5 PM, after; worked out again when the app comes back to the front), "What do you need today?"
  under it, then "Your booking": the soonest booking still to come or under way ("Tomorrow, 11:30 AM to 12:15 PM",
  services and price, status, start code), opening the booking; "See all N bookings" when there is more than one.
  Then "Want to book again?" with Book now, which opens the same salon with the same services ticked (`?services=`,
  as the come-back message does). Not offered at 2 upcoming bookings (a third is refused). With nothing coming up,
  Book now repeats the latest past booking (`['bookings','past-latest']`, one page, read only then), if its salon can
  still be opened. A first-time customer, a slow or failed bookings read: Home stays as before. Home reads the
  upcoming list at most every 30 s.
- **Email first, from a booking:** a customer whose email is still pending who taps Pick a time is sent to verify it
  (as before); the email screen then says "One step before you book" and that they come straight back with what
  they picked still there (one note in place of the usual text). Opened from Home's banner, it doesn't.
- Move is hidden within 1 hour of the start (`canMove` from the backend). Cancelling within 1 hour warns that it
  counts as a late cancel.
- **Free times stay current:** while a list of free times is on screen it is asked for again every 30 s, and at once
  when a message arrives, so a time someone just took goes and one just freed appears without a reload. A refresh
  that fails keeps the times with a note; a picked time that got taken is cleared with "That time isn't free any
  more".
- **"Tell me if an earlier time opens":** a switch on Confirm (off by default, kept in the draft, not shown for a
  booking within the hour; sent as `earlierAlert` only when on, so an older backend isn't refused) and on the
  booking page while it can still move (`PUT /bookings/{id}/earlier-alert`). When someone's cancel or move frees an
  earlier time that day that suits the booking, the backend sends a `BOOKING_EARLIER_SLOT` message whose link is
  `/bookings/{id}?earlier=<start>`. The booking page then shows "An earlier time opened" with one button, "Move to
  …" (the usual move): first to move gets it; if someone else was first, "Someone else took … first" and a way to see
  other times; a time that passed, or is now too soon for the salon, says so. A link for a time the booking is
  already at, or a broken one, shows nothing extra. Needs backend V33 (PR #44).

### My bookings and busy salons

- **Past bookings** come 30 at a time, latest first, with "Show more bookings": the next page starts after the last
  booking's `startsAt` and `id`, sent back exactly as received (keyset pages; the backend reads times to the
  microsecond). Upcoming bookings are a few at most and come in one answer (the backend refuses a cursor there). A
  failed page or a tap while offline keeps the list and says so; focus moves to the first new booking (or the count);
  `aria-busy` while loading; cards far off screen aren't drawn (`content-visibility`).
- **Bounded refreshes:** a refresh of a paged list (a booking changed, coming back to the app) asks every loaded page
  again, one after the other, so the pages stay joined with nothing missing or twice; each is a 304 when unchanged.
  At most 10 pages are loaded (300 past bookings, 300 messages), then a note says so — for past bookings only when
  the page after the cap (asked once) isn't empty, so exactly 300 shows no note. TanStack's `maxPages` isn't
  used: it would drop the latest page from the top, and the backend has no "page before" to bring it back.
- **Too many salon reads:** past 60 salon pages, service lists and free-time checks a minute the backend answers 429
  with `Retry-After`. The salon page, Confirm and the free times say "Too many tries — wait a minute, then try
  again." Nothing retries at once (a 4xx is final; the client repeats only `SERVICE_BUSY`), and a failed refresh
  of a salon page already on screen keeps it with a note. Free times on screen are the one exception: they are
  asked again every 30 s whatever the last answer was (2 reads a minute, far below the 60), so a 429 there clears
  on its own once the minute is over.
- **Busy backend:** `SERVICE_BUSY` (503, `Retry-After: 5`) is tried once more by the client after `Retry-After`, then
  by the query twice more, each after `Retry-After` too.

### Notifications

- `public/sw.js` shows the backend's Web Push messages (`{type, title, body, url}`) and opens the app on tap, only on
  this app's own pages.
- Offered once after a booking, and as a switch on Profile. Needs the backend's VAPID keys; without them the app says
  notifications aren't set up. On iPhone, notifications work only after "Add to Home Screen".
- Signing out or deleting the account turns them off for this browser first. After every sign-in the browser's
  subscription is sent again, which moves it to the person now signed in (one browser never gets another
  person's messages).
- **In-app messages:** the bell on Home shows the unread count (checked every minute and when the app comes back
  into view). The Messages screen lists the same messages the backend sends as notifications, so nothing is lost
  if notifications are blocked. Tapping one marks it read and opens its booking (only this app's own pages).
  When a push arrives while the app is open, the service worker tells the page, which refreshes the bell, the
  bookings and any free times on screen at once. Needs the backend's `GET /me/notifications` (backend PR #22).
- An open booking refreshes every 30 s while it can still change (booked or in progress), then stops.

## Deploying

Railway (a service that builds from `main`). `railway.json` picks Railpack, which sees a Vite site
(no `start` script), runs `npm run build` and serves `dist/` with Caddy, using this repo's `Caddyfile` instead of its
default: every address that isn't a file gets `index.html` (single-page app), `/health` answers 200, and every answer
carries the security headers. Keep the service's Start Command empty in Railway's settings: a start command turns
Caddy (and the headers) off. Set `VITE_API_URL` and `VITE_TURNSTILE_SITE_KEY` as the service's variables (they are
read at build time), optionally `PHOTO_ORIGIN` (default `https://*.r2.cloudflarestorage.com`, where signed photo
links point). Then add the site's address to the backend's `CORS_ALLOWED_ORIGINS`.

### Security headers

`security-headers.ts` works them out from the build's variables; the build writes them to
`dist/security-headers.caddy`, which the `Caddyfile` imports, and `vite preview` (the end-to-end tests) sends the same.

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; scripts from the site (plus `https://challenges.cloudflare.com` when the Turnstile key is set, also its frame); API calls only to `VITE_API_URL`; images from the site, `data:`, `blob:`, `PHOTO_ORIGIN` and the map tiles (`VITE_MAP_TILES`); styles allow inline (the map's pin and the Turnstile widget); no plugins; `frame-ancestors 'none'` (never inside another site's frame) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | `geolocation=(self)` (salons near you); camera, microphone, payment and the rest off |

CI's `headers` job builds as for production, starts Caddy with the `Caddyfile` (the build at `/app/dist`, as on
Railway) and checks every header on the app, a deep link, `sw.js`, the manifest and the offline page
(`scripts/check-headers.mjs`). The dev server sends none (hot reload needs inline scripts).

### Installing and offline

`public/manifest.webmanifest` lists the SVG icon and PNGs (192, 512, maskable 512) plus `apple-touch-icon.png` for
iPhone, all made from `public/icon.svg` by `npm run icons` (sharp); commit the PNGs after changing the SVG.
`public/sw.js` keeps a small offline page (`offline.html`, its CSS and the icon): opening the app without a
connection shows "You're offline" with "Try again" instead of the browser's error. Nothing else is cached. A new
version of `sw.js` waits after installing; the app shows "New version available — Reload" and only that button
switches over. Change `OFFLINE_CACHE` in `sw.js` when the offline page changes.

## Changelog

### 0.23.0 — 2026-11-14

Needs the backend with V61–V62 (service pictures). Deploy the backend first; an older one simply sends no pictures.

- **A picture for every service** on the salon page and the confirm screen: thin-line SVG (scissors, moustache,
  razor, colour, hair dryer, face, hand, feet, lipstick, crown…), the salon's choice, or the one the service's name
  fits. The same drawings as the partner app (`lib/serviceIcons.ts`); most are from Lucide (ISC licence), the
  salon-only ones drawn for Clozest in the same style. Names written in Devanagari are read too.
- **Confirm screen during an offer:** "Usual prices above; the offer price is in the total." under the services, so
  the lines (usual prices) and the total (offer price) don't look like they don't add up.

### 0.22.0 — 2026-11-14

Needs the backend with V55–V58 (the trade licence checked automatically). Deploy the backend first.

- **"Licensed" instead of "Registered" / "Unregistered"** on the salon cards: shown only when the salon's trade
  licence passed our automatic check and is still valid today. Any other salon shows no badge (many genuine local
  salons have no licence; "Unregistered" read as an accusation).
- **The salon page says it too**: the "Licensed" pill with "Its trade licence was checked by Clozest (valid until
  31 Mar 2027)", only while the licence is valid in India today.
- Scenarios in `docs/scenarios.md`; the cards' journey in `e2e/ratings.spec.ts`.

### 0.21.0 — 2026-11-14

Fixes from a salon customer trying the app:

- **Home greets by the time of day** ("Good morning, Riya", India time) and, for someone who has booked, shows
  **"Your booking"** (the next one: day, time from–to, services, start code) and **"Want to book again?" → Book now**
  (the same salon, the same services ticked; with nothing coming up, the latest past booking; not at 2 upcoming).
- **Pick a time shows how long the visit is:** each free time says when it would end ("10:00 AM to 10:30 AM"). On
  Move the end is the booking's own length; backend PR #59 makes Move's free times use it too.
- **No more times that clash with my own booking:** they were offered, then refused at Book now; the app leaves
  them out from the bookings it already holds. A booking cancelled while Move is open goes back to the booking.
- **The email step explains itself when a booking leads there:** "One step before you book", and that the booking
  carries on after.
- **Change number:** a wrong-code (or other) message now always gets the focus, so screen readers read it (it was
  sometimes lost).
- Tests: the fake backend refreshes like the real one (a tab reloaded mid-refresh stays signed in), which ends the
  change-phone and email tests that failed now and then.

### 0.20.0 — 2026-11-13

- **Any kind of file with a support request** (needs the backend's round-5 helpdesk, V54): "📎 Add photo, video or
  file" takes Word, Excel, zip and other files (at most 10 MB; videos 100 MB) besides photos and PDFs; an iPhone HEIC
  photo the browser can't read goes as a file instead of being refused. Such files show as a download; a PDF has a
  "Download" link too.
- **Fewer requests for thousands of users**: a resolved request (and a tab in the background) is no longer re-read
  every 30 seconds.
- A playing video keeps its place when its link is renewed on the hour (and a paused one picks up its new link).
- A file that can't be shown says so when attached ("Attached as a file…"); its row on the message names its kind
  ("DOCX file", "iPhone photo (HEIC)"); a video in a format we can't play goes as a file under 10 MB.

### 0.19.0 — 2026-11-13

- **Files sent by email show in My requests** (needs the backend's round-4b helpdesk, V52–V53): photos, PDFs and
  videos in their email to support@clozest.in show on that message, as the app's do; any other file is counted
  ("📎 1 more file sent by email (only in that email: we see it there)").

### 0.18.0 — 2026-11-13

- **Photos, videos and PDFs with a support request** (needs the backend's round-4a helpdesk, V49–V51): "📎 Add photo,
  video or PDF" on Need help and in My requests. Up to 5 per message; photos are shrunk on the phone first, videos (up
  to 100 MB) go straight to storage with their progress shown, and Send waits for them. With a file the words are
  optional. Support's files show in the request too: photos (tap for full size), videos to play, PDFs to open.
  Files are deleted 6 months after a request is resolved. An iPhone HEIC photo the browser can't read, a 6th file
  and a video over 100 MB are refused at once with what to do; a send whose answer was lost is kept once.
- **Signing out forgets what was typed** in Need help and My requests (a shared phone).
- The Content-Security-Policy allows the R2 address for the video's upload (`connect-src`) and playback (`media-src`).

### 0.17.0 — 2026-11-13

- **"Support replied"** (needs the backend's round-3 helpdesk): when support replies to a question, it shows in
  Notifications ("✉ Support replied on CLZ-1042") and as a push; tapping it opens the request in My requests. The
  email still comes too. Only the ticket number shows, never the reply or the subject (a push can show on a locked phone).

### 0.16.0 — 2026-11-12

- **My requests** (needs the backend's round-2 helpdesk): Profile → "My requests" lists what you asked support,
  with its status (with our support team, we replied, resolved). Open one to read the whole conversation, support's
  replies included (also sent by email), and add to it in the app. Writing on a resolved request opens it again.
  What you type is kept until it's sent. After sending a question, "See it in My requests" opens it; Need help
  links to it at the top ("Asked before?").
  The arrows never go round in a loop; a send repeated after a lost answer is kept once; the box keeps the focus
  after Send; the character count matches the backend's (invisible characters don't count).
- **Changing the mobile number no longer asks for an email first**: with no verified email the second code goes to
  the number you have now; the screen says so before you start, with what to do if that SIM is gone.

### 0.15.0 — 2026-11-12

- **The email after sign-up, not during it.** Sign-up is the phone code, then the name, then Home. While the email
  isn't verified, Home (and Profile) show "🔒 Verify your email to secure your account" with **Verify now**, and
  anything that does something asks for it first: booking (Pick a time), Need help, adding or editing a saved place,
  changing the name or phone, deleting the account (`EmailVerifiedOnly` in `src/app/guards.tsx`, typed addresses
  too). Once verified the app goes straight on to where the person was going, with what they picked still there (a
  booking's salon, services and time). Browsing (salons, bookings, messages) never asks. The email screen is now
  `/verify-email` (an old `/welcome/email` link goes there); Back leaves it for later.
- **Need help** (`/help`, needs backend V46): the customer writes to support in the app; it becomes a ticket (CLZ-1001)
  and the reply comes by email. What is typed is kept until it's sent. Profile's help card opens it ("Write to
  support", the address still shown), and "Let us know" (no salons near you) opens it with the subject and location
  filled in.
- The support address is **support@clozest.in** (it was a domain we don't use).
- Home shows only the categories that are open: no tabs while only Salon is (`src/features/home/categories.ts`).
- After review: deleting the account never asks for an email; Back on the email screen forgets the detour; where to
  go after verifying is kept per tab and per person; "Email verified" shows on whatever screen it leads to; the code
  step links to the support address; Need help keeps its draft per person, counts like the backend, names the field
  it refuses, and a booking has "Need help with this booking?".
- Scenarios 1, 26, 32, 43, 293, 302, 303 updated; 289–312 added in `docs/scenarios.md`.

### 0.14.0 — 2026-11-11

- **The logo's orange in the app.** Offers (offer cards, offer prices, the % on time chips, the offer-price lines on
  confirm, move and booking), star ratings (they were the warning yellow) and new messages (the bell's count, the unread
  dot) use the accent orange. The home question uses Poppins. `src/theme.test.ts` checks navy on orange and text on an
  offer card are AA.
- The salon list's offer badge, the confirm and booking offer prices and unread messages' cards are orange too; "That
  offer has ended" is a plain grey note so it isn't mistaken for a deal. Unread messages' dot is read as "Unread" by
  screen readers (its label was on an element they skip).
- End-to-end test fix: "too many wrong codes" waits for the new codes to be sent before typing them (typing earlier was
  wiped when the send finished, so the test failed now and then, on `main` too).
- Scenarios 287–288 in `docs/scenarios.md`.

### 0.13.0 — 2026-11-11

- **New look from the Clozest logo.** The theme's colours (`src/index.css`) now come from the dark logo: background
  `#0b0f26`, surfaces `#121736`/`#1a2048`, the logo's blue `#3d5bff` on buttons, borders and focus rings (the main
  button fades into the pin's violet `#5b21e6`, with a soft blue glow), links `#8c9cff`, and `#ff8a1f`, a lighter cut
  of the logo's orange `#ff7a00`, as the highlight colour (it was sky blue). `src/theme.test.ts` checks the theme's
  text and button pairs are WCAG AA, now including white on the violet end of the button, and that brand blue is
  never used as text (it is under 4.5:1 on the navy; text in the brand's colour uses link).
- **The logo** (`src/components/Logo.tsx`) is drawn in code on the sign-in screens: the location pin is the "C", then
  "LOZEST" and the orange sparkle. Screen readers hear "Clozest".
- **Poppins** (600, 700) for the logo and screen titles, bundled with the app (`@fontsource/poppins`), so the security
  headers' `font-src 'self'` still holds. Body text keeps the phone's own font.
- **Icons:** `public/icon.svg` is the new dark app icon; the PNGs, the manifest's colours, `theme-color` and the
  offline page follow. The service worker's offline store is `offline-v2`, so installed apps store the new offline page.
- The "Selected" label on Choose place is link-coloured (it was brand blue, under AA as text).
- Scenarios 281–286 in `docs/scenarios.md`.

### 0.12.1 — 2026-11-11

- Moving a saved place's pin with the arrow keys: the map follows when the pin nears its edge, so it stays in sight.
- Screen readers hear each keyboard move of the pin ("Pin moved east.").
- The day's address searches used up now says when they come back, in India time ("Try again after 11:15 PM", or
  "tomorrow, 9:30 AM": the window is 24 hours from the first search), not "Try again tomorrow".
- Scenarios 240 and 243 in `docs/scenarios.md`.

### 0.12.0 — 2026-11-11

Needs the backend with `POST /auth/me/phone/send-code` and `POST /auth/me/phone`.

- **Change your mobile number** (Profile → Mobile → Change): a code to the new number and a second one to your email. The same
  account moves to the new number (bookings and history stay); other devices are signed out, this one carries on. A
  number that already has an account is refused.
- A refresh on its way while the number changes waits for the new tokens instead of signing out (`replacingSession`).
- A lost answer after the change went through: the sign-in screen says the number probably moved and fills it in (an
  old-number sign-in would make a new, empty account). This device's notifications are registered again after the
  change. The "number is now …" notice shows once.
- Scenarios 267–280 in `docs/scenarios.md`; end-to-end journeys in `e2e/change-phone.spec.ts`.
### 0.11.0 — 2026-11-11

Needs the backend with V40 (saved places).

- **Saved places.** Home, Work and other addresses (up to 10), set exactly like a salon's address in the partner app:
  type it and "Find on map", or "Use current location" (fills the empty fields from the address there); either way a
  pin on the map to drag onto the building. Home and Work are one each; another place needs a name.
- **The current location in words:** under "Near your current location", the address there ("Lake View Apartments,
  Kondapur"); looked up again only after moving 300 m, at most 3 times a day, and kept on the phone.
- **A place picker above the salons:** "Near Home · Flat 4B, …" or "Near your current location"; Change opens the
  list (current location and every saved place), where each can be changed or deleted and new ones added.
- Location blocked or not allowed: "Or enter an address" instead of a dead end.
- The security headers allow the map tiles (`VITE_MAP_TILES`, default OpenStreetMap's).
- Scenarios 237–266 in `docs/scenarios.md`; end-to-end journeys in `e2e/places.spec.ts`.
### 0.10.0 — 2026-11-11

Needs the backend with V37–V39 (salon offers); against an older backend nothing about offers shows.

- **Salon offers:**
  - The salon card has a badge: "20% off · till 16 Nov", "· today" on its last day, "from 14 Nov" before it starts.
  - The salon's page lists its offers (the discount, the services, the days and hours) and shows each service's
    offer price next to its own.
  - Free times inside an offer are marked "%" (read out as "offer price"); Confirm shows the total crossed out and
    the offer price; the booking keeps it ("Booked at the salon's offer price"), even if the salon ends the offer.
  - The offer message opens the salon with the offer's services picked.
- **Offer messages can be stopped:** for one salon with the switch on its page (only salons you visited, since only
  they send them), or for every salon with "Offers from salons I've visited" on Profile, next to the come-back
  reminders. Each switch sends only its own choice; the two share one "Try again" when they can't be read.

### 0.9.0 — 2026-11-10

Needs the backend with V34–V36 (ratings, salon cards, come-back reminders).

- **Salon cards** show the rating ("★ 4.6 (12)", or "New" until 5 ratings), the address, the first services with
  prices ("+2 more"), and whether it is open now ("Open · till 9:00 PM", "Opens at 10:00 AM", "Closed today"), and "Registered" or "Unregistered" (whether the
  salon gave the field team its registration document, which is optional).
- Review fixes: a refused rating comment says why under the comment; "Keep my rating" puts back the saved rating;
  a come-back link whose services are all gone keeps the person's own picks; the come-back switch isn't shown as on
  when it couldn't be read; a salon open till the end of the day says "till midnight"; the cards' "Opens at" uses the
  time the list was read.
- **The salon's page** shows its rating with what customers liked most, its own opening hours and its holidays.
- **Rating a visit.** A completed booking's page asks "How was your visit?": stars, what went well, a comment only the
  salon sees; it can be changed for 14 days. My bookings (Past) marks visits still to rate. The "How was your visit?"
  message opens the booking with the stars ready.
- **Come-back reminders.** "Time for your next Haircut?" opens the salon with the same services picked. Profile has a
  switch to turn these messages off.
- More review fixes: the stars are one tab stop with arrow keys; the come-back switch waits while a change saves;
  each page of salon cards keeps the time it was read; a rating that closed while the form was open says so.
- "Registered" means the salon's document was checked by our field team. A salon with no working barber that day
  shows "Closed today".
- The location screen says "within 2 km" (it said 5 km; the list and the backend use 2 km).
- Scenarios 204–219 in `docs/scenarios.md`; end-to-end journeys in `e2e/ratings.spec.ts`.

### 0.8.0 — 2026-11-09

- "Tell me if an earlier time opens": a switch on Confirm (kept in the draft; not shown within the hour) and on the
  booking page; the message's link opens the booking with "Move to …" for the offered time in one tap; an offer
  whose time passed or is too soon says so. Sent only when on, so this app also works with an older backend. Needs
  backend PR #44 (V33).
- Free times on screen refresh every 30 s and when a message arrives (no reload needed to see a time taken or freed);
  a failed refresh keeps the times with a note, and a picked time that got taken is cleared with the reason.
- A refused move reads the booking again (e.g. its last hour began: Move goes at once).
- The new switch keeps focus while saving and is read with its explanation; after a move from an offer, focus goes
  to the result.
- The late allowance is 10 minutes: Confirm says so ("Arrive by" already comes from the backend).
- A reusable `Switch` (role="switch") in `components/ui.tsx`.
- Scenarios 176–203 in `docs/scenarios.md`; end-to-end journeys in `e2e/earlier-slot.spec.ts`.

### 0.7.0 — 2026-11-07

- Security headers on Railway: a `Caddyfile` (Railpack serves the build with Caddy) with CSP, HSTS, Referrer-Policy,
  nosniff and Permissions-Policy, worked out from the build's variables (`security-headers.ts`); `vite preview`
  sends the same, so every end-to-end test runs under the CSP and fails if it blocks anything; CI starts Caddy and
  checks the headers. `railway.json` picks Railpack.
- A screen that fails while drawing shows "Something went wrong on this screen" with "Start again" instead of a blank
  page (around each screen, the bottom bar stays; and around the whole app).
- Two reminders no longer replace each other: notifications have no `tag`.
- Installable everywhere: PNG icons (192, 512, maskable) and the iPhone icon from `icon.svg` (`npm run icons`), a
  complete manifest; an offline page when opened without a connection; a new version waits for "New version
  available — Reload" instead of switching silently. The service worker is registered also where push isn't offered.
- A refresh answered 409 `TRY_AGAIN` (another tab or request swapped the same token first) uses the newer token that
  was saved and retries the call once; never a loop.
- Dependabot (npm and GitHub Actions, weekly) and `npm audit --audit-level=high` in CI.
- Signing out (and a session ended by the backend) closes the booking messages still in the phone's tray, so the next
  person on a shared phone can't read them (as the partner app does).
- Removed the old `vercel.json` (a rewrite without the security headers): the app runs on Railway with Caddy only.
- CI: the build job's checkout keeps no token (`persist-credentials: false`), like the other jobs.
- Sign-in codes: 429 `TRY_LATER` (a network that must wait, backend #34's OTP back-off) shows "Too many tries from
  this network. Try again in N minutes." from `Retry-After`; `LOCKED_FOR_TODAY` (now only the guessing network) keeps
  the backend's words.
- Tests: an unchanged bell poll and message list are 304s and change nothing on screen (`inbox-etag.spec`).
- Day chips follow the salon's booking window: today plus its `maxDaysAhead` (1–30, `GET /salons/{id}`), when booking
  and when moving a booking; today plus the backend's default 7 (8 chips) until the salon is read (or from an older
  backend). The fake backend sends the bell's
  and the inbox's own `"n1-…"` ETags.
- Free and late cancels (backend apni-dukan-backend#34, "API changes in this version"): the free times' `freeCancelMinutes`
  and each start's `lateCancelFrom` come with the picked time; Confirm warns when that is less than the free minutes away
  (a start under about 1 h 10 min away), worded by the actual timing: under 1 h, it can't be moved and cancelling
  counts as late after its first 10 minutes; 60–70 min, until when it can be moved and until when cancelling is free. A booking shows "Free to cancel until …" from its own `lateCancelFrom` (or "Cancelling now counts as a late
  cancel."), and the cancel sheet's late warning uses it too, so a cancel within 10 minutes of booking isn't called late.
  An older backend without these fields: 1 hour before the start, as before.
- Tests: unit tests of the late-cancel rules; end-to-end the warning, free cancel within 10 minutes, a late cancel past
  `lateCancelFrom`; the fake backend sends `freeCancelMinutes`/`lateCancelFrom` and keeps `createdAt` on a move.
- Tests: unit tests of the error boundary, the service worker (stand-in globals), the update offer and the 409
  refresh; end-to-end headers, install icons and offline page.

### 0.6.0 — 2026-11-06

Uses the backend's scale PR (apni-dukan-backend#33, "Pages (the exact contract)"; merge that first):

- Past bookings 30 at a time with "Show more bookings" (cursor from the last booking, exactly as received); a failed
  or offline tap keeps the list and says so; focus on the first new booking or the count; `aria-busy`; at most 300
  loaded. Upcoming bookings stay one answer.
- 429 on a salon page, its services or free times: "Too many tries — wait a minute, then try again.", never retried
  at once (free times on screen are asked again every 30 s since 0.8.0); a failed refresh no longer replaces a salon
  page already on screen.
- Messages: at most 10 pages (300) loaded, then "Showing the latest 300 messages."
- A failed read is retried after the backend's `Retry-After` (503 SERVICE_BUSY: 5 s), not after 1 s.
- Tests: the fake backend pages past bookings and messages, refuses cursors and counts salon reads like the real one;
  end-to-end journeys for ties across a page end, exactly 30, a failed page, offline, focus, the caps, 429; unit
  tests of the paging helpers, the retry delay and the 429 words.

### 0.5.0 — 2026-11-06

- ETags: the API client keeps the last answer to each read in memory only (per person, at most 200 addresses), sends
  its ETag as `If-None-Match` and shows the kept data on a 304, so a booking, the bell or a list re-read with nothing
  changed downloads nothing. Answers stay `no-store` (a shared phone keeps nothing after sign-out); the memory is
  forgotten on sign-out, when the session ends and when another person signs in. A 304 is never an error and never
  retried. Needs the backend's scale PR (#31).
- A 304 for which nothing is kept (a cache or proxy on the way, or the person signed out or changed while the
  read was on its way) is asked once more without `If-None-Match` and past any cache, instead of becoming an error.
- Tests: the fake backend answers ETags and 304s like the real one; an end-to-end refresh answered 304; unit tests
  of the ETag memory.

### 0.4.0 — 2026-11-06

- Salons are listed within 2 km (was 5 km), 30 at a time with "Show more salons", so a dense area with hundreds of
  salons loads quickly. Needs the backend's scale PR (pages with `afterDistance` and `afterId`).
- "N salons within 2 km, nearest first" (no longer the wrong "within 5 km" count when the list was cut at 50).
- A failed "Show more salons" keeps the salons already shown and says so (offline is told at once); the button stays
  focusable while loading, focus moves to the first new salon, and the count is announced.
- Messages: "99+ unread" once there are more than 99 (the backend now counts up to 100).
- Tests: the fake backend pages like the real one and caps unread at 100; end-to-end journeys for a dense area,
  exactly 30 salons, a failed page and 99+ unread.

### 0.3.0 — 2026-11-04

- Flow diagrams in this README: sign-up and sign-in, booking, a booking's life, staying signed in.

Second review round (four independent reviews: customer app, backend, backend inbox, contract between them).

- "Sign out on all devices" never fails quietly: if the backend can't be reached, this device stays signed in and
  says the other devices are still signed in.
- A service the salon removed is dropped from a saved draft (it used to be sent with every booking and fail).
- Confirm shows an error with retry instead of an empty ₹0 summary when loading fails.
- `BOOKING_BLOCKED` says when online booking opens again; `TOO_MANY_CHANGES` ends the attempt (new key).
- `PROFILE_INCOMPLETE` refreshes the profile and comes back to Confirm after the missing step.
- `CAPTCHA_REQUIRED` resets the robot check like `CAPTCHA_FAILED`.
- Change email: a wrong or used-up SMS code goes back to the SMS step instead of leaving the person stuck.
- A complete user is sent on from the sign-up steps; resend buttons can't fire twice and email has a 30 s wait.
- A saved location older than 30 minutes is checked again (quietly, when allowed); a failed Update says so; the
  location is forgotten on sign-out.
- A browser subscription the backend didn't accept is dropped, so the switch never says On wrongly; iPhone users
  see how to get notifications (Add to Home Screen).
- Dialogs: focus moves in, Tab stays inside, Escape closes, focus returns.
- Money with paise shows two decimals (₹99.50); the service worker opens a fresh window when it can't navigate.
- Leaving Confirm after a taken time no longer bounces to the salon page (found by the new end-to-end tests).
- End-to-end tests in CI.

Scenario audit (146 customer scenarios, `docs/scenarios.md`) and its fixes:

- Outside India: "Clozest works only in India" instead of "Some fields are not valid".
- Confirm sends exactly the services it shows (a removed one is never sent).
- Moving: the free times count the booking's own time as free (`moving=`), so a move by a few minutes is offered.
- When Move isn't offered more than an hour ahead, the reason given is the salon not taking changes.
- `OVERLAPS_YOUR_BOOKING` (one person, two bookings at once) ends the attempt with the backend's message.
- 17 end-to-end journeys now, including: profile incomplete at booking, a move losing its time, a salon taken
  off the app, no salons nearby, outside India, expired and too-many-tries codes, signing out in one of two tabs.

### 0.2.0 — 2026-11-04

- In-app messages: bell with the unread count on Home, Messages screen, mark one or all read, older pages.
- A push that arrives while the app is open refreshes the bell and the bookings.
- Profile: a help card with the support email (`VITE_SUPPORT_EMAIL`). (0.15.0: "Write to support" opens Need help.)
- The booking screen stops refreshing once the booking is finished or cancelled.
- Wording: the email step no longer promises receipts (none are sent); "No free times" covers closed days too.
- Review fixes: several tabs no longer sign the person out everywhere; signing out during a refresh stays signed
  out; a session ended by the backend drops this browser's notifications, draft and return path; notifications are
  claimed for whoever signs in; `IDEMPOTENCY_KEY_REUSED` is handled; a taken time disappears at once; a saved draft
  drops past days; the next person to sign in starts at Home, not on the previous person's page.
- Tests: 24 (added: the newest saved refresh token is used, a late refresh after sign-out, the stale draft).

### 0.1.0 — 2026-11-04

- First version of the customer app: sign-in (phone, email, name), account recovery, location with a guide when it
  is off, nearby salons, salon page, time picker, booking, My bookings, booking detail with start code, move,
  cancel, profile, change email, delete account, push notifications, dark theme.
- Unit tests for India time, money, phone numbers, the session steps, the API client (shared refresh, busy retry,
  error codes) and the sign-in form.
- CI: type-check, lint, tests, build, gitleaks (with read access to pull requests, which the scan needs).
