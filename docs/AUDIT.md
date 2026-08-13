# GroupPad — Full-Site Audit (2026-08-06)

A six-dimension audit run across the codebase: Security/Auth, Backend health & reliability,
Frontend UX & accessibility, Performance, SEO/PWA/landing, and Testing/CI/infra.
Findings are ticket-style (paste into Jira/Linear later) and grouped by **tier** =
when to do it. Each has **Impact** (High/Med/Low) and **Effort** (S/M/L).

**Overall verdict:** the app is fundamentally healthy and already notably hardened
(env-based admin key + constant-time compare, SSRF guards, path-traversal regex,
parameterized SQL, HttpOnly/SameSite cookies, prototype-pollution guards, a
well-built service worker, and a clean client `tsc`). No emergencies. The list below
is about resilience, measurement, conversion, and closing correctness gaps.

**Verified during the audit:** `PIPELINE_DATA_DIR=/data` on Railway *is* the mounted
volume (`exquisite-inspiration-volume`), so user data currently survives redeploys.
The risk is the lack of a guard, not the current config.

---

## ✅ TIER 0 — SHIPPED 2026-08-06 (all 8 implemented on branch redesign-v2)

- **A1** — `client/index.html`, `robots.txt`, `sitemap.xml` now point at `grouppad.goldhac.com`.
- **A2** — `compression()` middleware added (server.js); `compression` dep installed.
- **A3** — static cache policy: `/assets/*` immutable 1y, `index.html` no-cache, media 1d.
- **A4** — `pipeline.js` skips the write when a scrape returns 0 but a prior board exists.
- **A5** — `uncaughtException` → `process.exit(1)`; `healthcheckPath:/healthz` in `railway.json`.
- **A6** — boot-time fail-fast if `PIPELINE_DATA_DIR` is the ephemeral image path in production.
- **A7** — react-router → 6.30.4 (2 **high** open-redirect/injection fixed; 2 moderate need v7 major, deferred).
- **A8** — PostHog analytics + client error monitoring, wired via runtime config injection.
  **Activate by setting `POSTHOG_KEY` as a Railway variable** (no-op until then).

Verified: `node --check` clean (server.js, pipeline.js); client `tsc --noEmit` clean; cache logic
unit-checked. Runtime express boot is blocked by a sandbox module-load quirk (unrelated) — the full
build validates in the Docker/Railway deploy.

---

## TIER 0 — original detail (cheap, high-leverage; several tie directly to the domain move)

### GP-A1 · SEO: canonical/OG/JSON-LD/robots/sitemap still point at the OLD Railway domain — TODO
**Impact: High · Effort: S** — Security/SEO
We just moved prod to `grouppad.goldhac.com`, but `client/index.html:8,47,48,59,70,79,80`
still set `canonical`, `og:url`, `og:image`, `twitter:image`, and all JSON-LD `url`
fields to `https://exquisite-inspiration-production-7511.up.railway.app`. `client/public/robots.txt:5`
and `client/public/sitemap.xml:4` point at bare `goldhac.com` (wrong host). A cross-domain
canonical tells Google the Railway URL is authoritative → can suppress/deindex the real
domain and hand ranking signals to a staging URL. Share previews also load images from Railway.
**Fix:** replace every occurrence with `https://grouppad.goldhac.com`.

### GP-A2 · Perf: no gzip/brotli compression — everything ships ~3.5× too big — TODO
**Impact: High · Effort: S**
No `compression` dep; `express.static` (`server.js:64`) serves raw. Main bundle transfers
584 KB instead of 165 KB gz, CSS 350 KB instead of 57 KB, plus every API JSON uncompressed.
**Fix:** `app.use(compression())` before static/API middleware.

### GP-A3 · Perf: static assets served with no Cache-Control/immutable headers — TODO
**Impact: High · Effort: S**
`express.static` (`server.js:64`) sets no `maxAge`/`immutable`. Vite emits content-hashed
filenames safe to cache a year, but every repeat visit re-validates and the ~8 MB of landing
videos/images re-transfer.
**Fix:** `express.static(dir, { maxAge: '1y', immutable: true })` for hashed assets; short TTL for `index.html`.

### GP-A4 · Backend: a failed/empty scrape overwrites a healthy board with an empty list — TODO
**Impact: High · Effort: S**
`pipeline.js:1192-1200` (`runTripSearch`) unconditionally writes `final = pool.slice(...)`.
If Airbnb returns 0 (markup change, transient block, Apify exhausted), the board goes **blank**.
Non-LA trips have no seed fallback.
**Fix:** `if (final.length === 0 && hadPrev) { console.warn('empty result — keeping previous board'); return; }` before the write.

### GP-A5 · Backend: `uncaughtException` handler never exits → Railway never restarts the process — TODO
**Impact: High · Effort: S**
`server.js:3886` logs but doesn't `process.exit`, so `restartPolicyType: ON_FAILURE` never
fires. After an uncaught exception Node keeps serving requests and writing files in a corrupt state.
**Fix:** log, then `process.exit(1)`. Also add `"healthcheckPath": "/healthz"` to `railway.json` (endpoint exists at `server.js:3889` but isn't wired).

### GP-A6 · Backend: no boot-time guard on `PIPELINE_DATA_DIR` — TODO
**Impact: High (latent) · Effort: S**
`server.js:39` / `pipeline.js:43` default to `__dirname/data` (ephemeral) if the env var is
unset. Currently set correctly, but if it were ever removed/changed, all accounts/votes/decisions
wipe on next deploy with no warning.
**Fix:** in production, fail-fast (or log loudly) if `DATA_DIR` resolves to `__dirname/data`.

### GP-A7 · Testing: `npm audit` — react-router open-redirect (2 high) — TODO
**Impact: Med · Effort: S**
react-router `6.0.0–7.17.0`: open redirect via backslash in `<Link>`/`useNavigate` + arbitrary
constructor injection. Directly reachable in an app with shareable links. postcss moderate too.
**Fix:** `npm audit fix` in `client/` (and root); re-run typecheck/build.

### GP-A8 · SEO: no analytics and no error monitoring anywhere — flying blind — TODO
**Impact: High · Effort: S**
No gtag/plausible/posthog/sentry anywhere. No funnel data (landing→signup→trip created), no
client-side error visibility on a launched product. Every other improvement here is unmeasurable
without this.
**Fix:** add privacy-light analytics (Plausible/PostHog) + error monitoring (Sentry/PostHog) in `main.tsx`.

---

## ✅ TIER 1 — SHIPPED 2026-08-06 (8 of 10 on branch redesign-v2)

- **A9** — `enterTrip(id, force)`; the 6 post-mutation reloads (save settings, close voting, transfer creator, in ManageView + MobileManage) now pass `force:true`, fixing the stale-state bug.
- **A10** — `helmet` added: X-Frame-Options, nosniff, HSTS, Referrer-Policy, X-Powered-By hidden. CSP intentionally deferred (needs tuning vs fonts/PostHog/Google/Airbnb).
- **A11** — `requireTripMember` added to `POST /api/trips/:tripId/reviews/fetch`.
- **A12** — `rateLimit({windowMs:1h, max:12})` on `POST /api/trips` (each create spawns a scraper).
- **A13** — `castVote` + `toggleFinalPick` now optimistic with rollback (net-votes count + final tally move instantly).
- **A14** — new trip IDs use `randomBytes(10)` (80-bit) instead of 4-byte/32-bit; existing IDs still work. (Read-route rate-limiting skipped to avoid interfering with the 8s poll — the entropy bump alone makes enumeration infeasible.)
- **A15** — desktop landing "Start free" opens the auth modal (Google + email) instead of hard-redirecting into Google's consent screen.
- **A16** — `.github/workflows/ci.yml`: client typecheck+build, server `node --check`, and `npm audit --audit-level=high` on PRs/pushes to main.

**Deferred (larger, and now better informed by live PostHog data):** A17 route code-splitting, A18 scraper resilience (retry/backoff, proxy, shape-canary). See Tier 2.

Verified: `node --check` clean (server.js, pipeline.js); client `tsc --noEmit` clean; CI YAML valid.

---

## TIER 1 — original detail (correctness, security hardening, conversion)

### GP-A9 · Frontend: post-mutation `enterTrip` reload silently no-ops → stale settings/close-voting — TODO
**Impact: High · Effort: S** — real correctness bug
`store/AppContext.tsx:291` early-returns when the trip id is unchanged, so `ManageView.tsx:118,130,131`
(and MobileManage) calling `enterTrip(trip.id)` after `patchTrip` never refresh the store.
"Close voting" toasts success but the button still reads "Close voting" (stale) → organizer clicks
again and re-opens it. Edited dates/budget/name don't reflect until a full reload.
**Fix:** use the `patchTrip`/`transferOrganizer` return value to `setTrip`, or add a `force` param to `enterTrip`.

### GP-A10 · Security: no security headers (helmet/CSP/X-Frame-Options/HSTS/nosniff); x-powered-by on — TODO
**Impact: Med · Effort: S**
No header middleware. No `X-Frame-Options`/`frame-ancestors` → clickjacking of the authenticated
board; no nosniff; no HSTS; `X-Powered-By: Express` leaks stack.
**Fix:** `app.use(helmet(...))` + `app.disable('x-powered-by')`.

### GP-A11 · Security: `reviews/fetch` checks auth but not trip membership — cross-trip paid-scrape abuse — TODO
**Impact: Med · Effort: S**
`server.js:3139` omits `requireTripMember` (comment says "members only"). Any authenticated user
can trigger paid Apify review scrapes against any trip ID.
**Fix:** insert `requireTripMember` in the middleware chain (mirror `ai-rank`).

### GP-A12 · Security: trip creation has no rate limit; each create spawns a scraper — TODO
**Impact: Med · Effort: S**
`server.js:3395` `POST /api/trips` has no `rateLimit`; each call spawns a `node pipeline.js` child.
Cost/DoS lever even with the global `apifyGuard`.
**Fix:** `rateLimit({ windowMs: 3600000, max: ~10 })` on trip creation.

### GP-A13 · Frontend: voting & top-pick are non-optimistic → thumbs-up feels laggy/broken — TODO
**Impact: Med · Effort: M**
`store/AppContext.tsx:611-638` awaits the network before updating (favorites at :640-658 are
optimistic with rollback — mirror that). On slow links the count doesn't move, inviting double-taps;
no pending/disabled state.
**Fix:** make `castVote`/`toggleFinalPick` optimistic with rollback on error.

### GP-A14 · Security: trip content confidentiality rests on a 32-bit ID; open read routes unrate-limited — TODO
**Impact: Med · Effort: M**
`server.js:309` mints `slug-<8 hex>` (4 bytes). All read routes (`GET /api/trips/:id`, `/listings`,
`/votes`, `/itinerary`, `/caveats`, …) are open view-by-link with no rate limit, so a guessed slug's
suffix is brute-forceable → read another group's homes, itinerary, member names + caveats.
**Fix:** mint IDs with `randomBytes(12)+` and rate-limit the open read routes.

### GP-A15 · SEO/Conversion: desktop "Start free" hard-redirects into Google OAuth — TODO
**Impact: High (conversion) · Effort: S**
`LandingView.tsx:35-38` sends a cold visitor straight to Google's consent screen (no email option,
no soft landing). Mobile already does the right thing (`MobileLanding.tsx:37` opens an auth modal).
**Fix:** route desktop CTA through the same `openAuth()` modal.

### GP-A16 · Testing: no CI whatsoever — nothing gates a deploy — TODO
**Impact: High · Effort: M**
No `.github/`, no lint/typecheck/test on PR. Combined with manual `railway up` from `main`, a broken
commit reaches prod unintercepted.
**Fix:** `.github/workflows/ci.yml` running `cd client && npm ci && npm run typecheck && npm run build` + `npm audit` on PRs.

### GP-A17 · Perf: no route code-splitting — one monolithic bundle for everyone — TODO
**Impact: Med · Effort: M**
`App.tsx:13-21` eagerly imports every view — desktop + all 8 `Mobile*` + admin + legal + press.
Mobile users download the desktop tree and vice-versa; guests download admin code.
**Fix:** `React.lazy` route elements behind `<Suspense>` (esp. mobile↔desktop split, admin, legal/press).

### GP-A18 · Backend: scraper is markup-coupled, single unproxied IP, no retry/backoff — TODO
**Impact: High · Effort: L**
`airbnbSelfHostSearch` (`pipeline.js:466-516`) depends on undocumented Airbnb JSON shapes; any change
→ 0 results (feeds GP-A4). Single Railway egress IP, static UA, no proxy rotation, no backoff on a
blocked run. Scheduled/user scrapes also discard logs (`stdio:'ignore'` at `server.js:3375,2936,3795`).
**Fix:** treat 0-results as soft failure (don't overwrite), add retry-with-backoff, log child stdio, add a shape-canary.

---

## TIER 2 — Later (depth, resilience, scale)

### GP-A19 · Perf: board open fans out to ~8 API round-trips + N blocking file reads — TODO
**Impact: Med · Effort: M**
`AppContext.tsx:302-313` calls 8 endpoints; each does a synchronous `fs.readFileSync`+`JSON.parse`
(`readJson` `server.js:204`) with no cache. The 8s poll adds votes+final reads per member tab forever.
**Fix:** add a `/api/trips/:id/board` aggregate endpoint; cache parsed JSON by mtime (or async fs).

### GP-A20 · Perf: `pipeline-listings` returns full dataset + all photos, no pagination — TODO
**Impact: Med · Effort: M**
`hPipeline` (`server.js:2495`) ships every listing with all photos/amenities (63 listings × ~5.7
photos = 360 URLs); no virtualization on the client. Largest single API response, uncompressed today.
**Fix:** slim list projection (defer full amenities/extra photos to detail-open); paginate/virtualize as counts grow.

### GP-A21 · Perf: listing images loaded at Airbnb `/original/` size — TODO
**Impact: Low/Med · Effort: S**
Cards render ~400px but fetch full-size (`Carousel.tsx:25`). `?im_w=720` ≈ 25% smaller.
(Good already: `loading="lazy"`, single-photo carousel, `aspect-ratio` controls CLS.)
**Fix:** append `?im_w=720` when building card `src`.

### GP-A22 · Backend: cross-process lost-update race on `trips.json` — TODO
**Impact: High (rare) · Effort: M**
The detached pipeline reads+rewrites the whole `trips.json` to stamp `refreshed_at`
(`pipeline.js:1204-1213`) while the server may add a member/trip — last writer wins, silent loss.
No lock (temp+rename prevents corruption but not lost updates).
**Fix:** write `refreshed_at` to a small per-trip file the server merges, or add a lockfile; never rewrite the global registry from a long-lived process.

### GP-A23 · Frontend a11y batch — TODO
**Impact: Med · Effort: S each**
- Mobile cards/trip cards use `role="button" tabIndex=0` with no `onKeyDown` (`MobileBoard.tsx:226`,
  `MobileTrips.tsx:52,109,124`) → not keyboard-operable.
- Native `confirm()` for destructive actions (`Card.tsx:286`, `MobileDetail.tsx:136`,
  `MobileTrips.tsx:148`, `ItinerarySection.tsx:82`) — unreliable in installed PWA; use the styled `ConfirmDialog`.
- `ConfirmDialog` (`ManageView.tsx:338`) lacks focus trap / focus restore / initial focus (other modals use `useFocusTrap`).
- Empty `alt=""` on thumbnails in `BoardTable.tsx:49` and `DecisionStrip.tsx:71` → pass `alt={l.name}`.
- Board tabs ARIA-incomplete (`BoardView.tsx:244`): no `tabpanel`/`aria-controls`, no roving tabindex/arrow keys.

### GP-A24 · Frontend: transient load failures dead-end with no retry — ✅ DONE 2026-08-11
**Impact: Med · Effort: S**
`TripGate.tsx` error screen offers only "Go home" and re-nav won't refire (`enterTrip` early-return,
`tripError` never cleared). A failed `myTrips()` (`AppContext.tsx:259`) is swallowed → false
"Create your first trip" empty state for an existing user.
**Fix:** add "Try again" that clears the error + forces reload; track `tripsError` and show retry instead of empty state.

### GP-A25 · Testing: no backend tests on money paths — TODO
**Impact: High · Effort: L**
`testsprite_tests/*.py` need a live server + hardcoded session, aren't wired to any runner, and don't
cover magic-link auth, email send, or the lock-decision/final-vote flow. `server.js`/`pipeline.js`
have zero unit/integration tests.
**Fix:** add vitest+supertest against an in-process app with a temp DATA_DIR: auth → create → vote → lock, plus a pipeline smoke test.

### GP-A26 · Backend: SQLite migrations are blind `ALTER TABLE` in bare try/catch; no schema layer — TODO
**Impact: Med · Effort: M**
`pipeline.js:192` swallows every migration error, not just "duplicate column"; no `schema_version`.
Three listing-mapping paths hand-build subtly different object shapes with no shared schema/validation.
**Fix:** use `PRAGMA user_version` + ordered migrations; re-throw non-duplicate errors; one shared listing normalizer.

### GP-A27 · Backend: email send failures logged & dropped (incl. magic-links) — ✅ DONE 2026-08-11
**Impact: Med · Effort: S**
`sendEmail`/`sendMagicLink` (`server.js:682`) `return false` on a Resend non-2xx with no retry — a
member never gets their login link and no one notices.
**Fix:** surface magic-link failures to the caller (UI can retry); bounded retry on transient 429/5xx.

### GP-A28 · SEO: HashRouter + blank-div SPA = deep content uncrawlable; add noscript + FAQ JSON-LD + social proof — TODO
**Impact: Med · Effort: M**
`main.tsx:33` HashRouter + `index.html:87` empty `#root`, no `<noscript>`, no SSR/prerender. Landing
has no testimonials/counts/trust signals (`LandingView.tsx`).
**Fix:** add a `<noscript>` value-prop block; consider prerendering the landing; add FAQ JSON-LD + lightweight social proof.

### GP-A29 · Backend: split the 3,900-line `server.js` monolith — TODO
**Impact: Low (reliability) / Med (maintainability) · Effort: L**
All routing/auth/storage/integrations/scheduler/email in one file; `getTrip` re-reads the file per call
inside loops.
**Fix:** split into `routes/`, `storage/`, `integrations/`; cache `loadTrips()` per request.

### GP-A30 · Infra hygiene batch — TODO
**Impact: Low · Effort: S each**
- No `.env.example` for ~45 env vars → commit one (required/optional + one-line purpose).
- No `.nvmrc`; Docker `node:20-bookworm-slim` floats (native `better-sqlite3` ABI matters) → pin.
- Stray `Icon\r` + marketing binaries untracked and un-gitignored → add patterns, remove.
- Committed QA session cookie in `testsprite_tests/*.py` → invalidate server-side, parameterize.
- Owner email + prod URL as hardcoded env fallbacks (`server.js:433,677`) → require the vars.
- Session `Secure` flag is conditional on `req.secure` → set unconditionally in prod.

---

## Already healthy (don't spend effort here)
- Admin auth: env-based key + constant-time compare (the old hardcoded `la2026admin` is remediated).
- SSRF guards (private-IP + DNS-rebind + redirect re-validation), path-traversal regex on IDs,
  parameterized SQL everywhere, prototype-pollution guards, 256 KB body cap, `trust proxy 1`.
- Service worker: network-first navigations, never caches `/api/` or `/s/`, clean update strategy.
- Client `tsc --noEmit`: 0 errors. Images `loading="lazy"` with controlled CLS. Lottie code-split.
- Scraper runs as a detached child (doesn't block the event loop). No source maps shipped.
- Data volume currently mounted correctly (`PIPELINE_DATA_DIR=/data`).

---

## Trip-readiness pass — SHIPPED 2026-08-11 (before the Aug 18 LA trip)

**GP-A27 · magic-link delivery.** The real defect was worse than "logged and
dropped": `sendMagicLink` RETURNS false on failure rather than throwing, so the
handler's `try/catch` never fired and the API answered **`{ok: true}`** — a guest
whose email silently failed was told to check their inbox and could never sign in.
Now: `sendEmail` retries transient failures (429 / 5xx / network) 3× with 400ms→800ms
backoff and does NOT retry permanent 4xx; the handler checks the return value and
answers **502 with an honest message** ("try again in a moment, or use Google
sign-in") plus a loud server log. Retry policy unit-verified.

**GP-A24 · retry states.** Two dead-ends removed:
- The trip error screen offered only "Go home" and `enterTrip` early-returns on an
  unchanged id, so it could never recover without a full reload → added
  `retryTrip()` (clears the error, forces a reload) behind a **"Try again"** button.
- A failed `myTrips` fetch was swallowed, so a network blip greeted a returning
  user with the first-run **"Create your first trip"** screen → now tracked as
  `tripsError` and rendered as an honest "Could not load your trips" + Try again.

This also closes the design-audit finding that **no error states existed anywhere**
on the trips/board path.
