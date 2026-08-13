# Experiences — "Things to do" for GroupPad

**Status:** Building (Phase 1 in progress) · **Owner spec.** Created 2026-08-11.
**Read this first** if you're picking up any GP-5 / Experiences work.

## 1. Product intent (the one-paragraph version)

GroupPad's wedge is "the group can't agree." Homes proved it. Experiences extends the
same loop — discover → vote → decide — to *things to do* on the trip. We are **not**
building a booking marketplace (no payments, no availability, no cut). We surface
Airbnb Experiences for the trip's destination + dates, let the group react, and roll
the winners into the trip's existing itinerary. Booking happens on Airbnb via outlink,
exactly like homes.

**Two anchor moments:**
- **While choosing a home:** browse what's around the destination ("this area has great
  stuff to do" is a real input to the home decision).
- **After the pick is locked:** "now that you have your place, here's what's near it" —
  re-centered on the chosen home.

## 2. Data foundation (DONE — `experiences.js`)

Free self-hosted scraper, same mechanism as the homes self-host (headless Chromium →
embedded deferred-state JSON on `https://www.airbnb.com/s/<slug>/experiences`).
Validated live: 40 fully-populated LA results, no block, no captcha, $0.

- Node type `ExperienceSearchResult`; cursor pagination (`nextPageCursor` → `&cursor=`).
- Normalized row: `{ id, title, category, price, currency, rating, reviews, url, photo,
  lat, lng, duration }`.
- `searchExperiences({ location, checkin, checkout, adults, maxItems })` exported;
  CLI: `node experiences.js "Los Angeles" [checkin] [checkout] [adults]`.
- **Coords gap:** search results carry NO lat/lng (free-text `activityLocation` only).
  Being fixed via per-experience detail fetch (`fetchExperienceCoords` /
  `enrichExperiencesWithCoords`) — see §5 Phase 2. Until then all distance features
  are Phase 2+, nothing in Phase 1 needs coordinates.

## 3. Architecture decisions (settled — don't relitigate casually)

- **Storage:** per-trip `experiences.json` via `tripFile(tripId, 'experiences.json')`,
  written atomically by a runner script — mirrors `listings.json`.
- **Refresh model:** a detached child process (`scripts/run-experiences.js`) spawned by
  the server, mirroring `spawnTripSearch` (env-passed config, `.exp-searching` marker,
  logs inherited). Triggered (a) alongside the homes trip-search, (b) lazily on first
  GET when no file exists, (c) manually via a member-only refresh endpoint.
  **Empty-result guard:** a 0-result scrape must NOT overwrite an existing non-empty
  file (same lesson as GP-A4).
- **Votes:** separate store `exp-votes.json` per trip, same shape as homes votes
  (`{ [expId]: { [userId]: 'up'|'down' } }`). Deliberately NOT mixed into the homes
  votes file so group-pulse "% voted" and decision math stay untouched.
- **Endpoints** (mirror homes patterns + middleware exactly):
  - `GET  /api/trips/:tripId/experiences` — open view-by-link (like listings);
    returns `{ experiences: [...], pending: bool }`; lazy-spawns on missing file.
  - `POST /api/trips/:tripId/experiences/refresh` — requireAuth + requireTripMember +
    rateLimit; respects dormant trips (decided/past → 409 like homes refresh).
  - `GET  /api/trips/:tripId/exp-votes` — open read.
  - `POST /api/trips/:tripId/exp-votes` — requireAuth + requireTripMember + rateLimit;
    body `{ experience_id, vote: 'up'|'down'|null }`.
- **Client state:** `experiences`, `expVotes` in AppContext, loaded in the `enterTrip`
  bundle with `.catch(() => …)` fallbacks (never block board load). `castExpVote` is
  optimistic-with-rollback (same as homes `castVote` after GP-A13).
- **UI:** new board tab `todo` ("Things to do") beside the existing tabs, using the
  ds2 design system as-is (`card`, `badge`, `btn`, existing grid classes). New
  `ExperienceCard` modeled on `Card.tsx` idioms (photo, badges, vote buttons,
  outlink). **No new design language now** — a Claude-design polish pass comes later;
  ship on ds2 so it matches the app.
- **Dormant trips:** only PAST trips stop refreshing experiences. A locked decision
  does NOT freeze them (unlike homes) — post-decision planning is the feature's
  second anchor moment. (Fixed 2026-08-11 after the LA trip, settled but upcoming,
  correctly refused to spawn under the homes rule.)

## 4. Feature list (full, phased)

### Phase 1 — MVP: discover + vote (BUILD NOW)
| # | Feature | Notes |
|---|---------|-------|
| 1.1 | Experiences runner + storage | `scripts/run-experiences.js`, per-trip file, empty-guard |
| 1.2 | Experiences + exp-votes endpoints | as in §3 |
| 1.3 | Board tab "Things to do" (desktop) | grid of ExperienceCards; loading/empty/pending states |
| 1.4 | ExperienceCard | photo, title, category chip, price/guest, ★rating (count), duration, 👍/👎 with net count, "Open on Airbnb" outlink |
| 1.5 | Vote on experiences | optimistic, per-member, tallies visible to group |
| 1.6 | Mobile board parity | same tab/section in MobileBoard with mcard styling |
| 1.7 | Sort | default: net votes desc → rating; secondary: price |
| 1.8 | PostHog events | `experiences_viewed`, `experience_voted`, `experience_outlink` — the engagement signal that gates Phase 3 investment |

### Phase 2 — Location awareness (SHIPPED 2026-08-11)
| # | Feature | Notes |
|---|---------|-------|
| 2.1 | Coords enrichment | DONE — detail-fetch (or geocode fallback) filling lat/lng; cached |
| 2.2 | "Near your pick" | DONE — after decision locked: distance chip on each card + "Nearest" sort (desktop + mobile). Anchor logic in §5 |
| 2.3 | Nearby strip on home detail | DONE — 4 closest experiences inside DetailModal + MobileDetail (`.dx-nearby`); `experience_nearby_clicked` event |

### Phase 2.5 — Pricing depth + dialog (SHIPPED 2026-08-11)
- Scraper emits `originalPrice` (discount strikethrough + "Save $X" badge) and
  `priceUnit` ('guest'|'group'); group-priced rows show ~$/person at the trip split.
- `ExperienceModal` (house modal-scrim pattern, exported from ExperiencesSection) —
  card tap opens it on desktop + mobile; `experience_detail_opened` event.
- GET /experiences now respawns on 24h staleness OR missing schema keys.
- **Reviews SHIPPED (2026-08-11):** `fetchExperienceReviews(id)` (free detail-page
  fetch → newest ~7 translated snippets + aggregate) wired to
  `GET /api/trips/:tripId/experiences/:id/reviews` (id must be on the trip's list,
  per-trip `exp-reviews.json` cache, 7-day TTL, stale-if-error) and rendered in
  ExperienceModal (aggregate line + up to 4 quotes). Verified live on prod.

### Phase 2.6 — Leaderboard: where votes go (SHIPPED 2026-08-11)
The answer to "when they vote, where does it go": a **live leaderboard** at the top
of the Things-to-do tab (desktop + mobile), reusing the homes `.leaderboard`/`.lb-bar`
pattern so it reads as one family, not a new surface.
- Ranked rows (#1..10) by **net likes**, bar widths relative to the current leader,
  `--dur-base` width transition; rows reorder live (optimistic locally, ~8s poll for
  everyone else). Down-voted/negative items are excluded; leader gets the gold star.
- Derived purely from `exp-votes` — **no new store, no new tab** (avoids clutter).
  Helpers `expGroupList()` / `expListToItinerary()` exported from ExperiencesSection.
- Empty state teaches the mechanic ("hit 👍 and it climbs this leaderboard") instead
  of hiding the panel.
- Organizer-only **"Add top N to trip plan"** → appends a formatted block to the
  existing itinerary (Discussion → Trip plan); `experiences_sent_to_itinerary` event.
- Ordering/reorder logic verified by a standalone simulation (rank changes as votes
  accrue, negatives excluded, cap 10).

### Phase 3 — Decision + itinerary (3.1–3.3 SHIPPED 2026-08-11)
| # | Feature | Notes |
|---|---------|-------|
| 3.1 | Generated day-list | DONE — `POST .../plan-experiences` builds a day-by-day plan from up-voted experiences; organizer "Add to trip plan" appends it to the itinerary |
| 3.2 | Scout for experiences | DONE — the **Plan** job (docs/specs/scout.md §2): Gemini, cached by votes+dates hash, `heuristicPlan` fallback, ≤2/day + ~6h/day, per-item "why" |
| 3.3 | Experiences in per-person cost | DONE — `expPlanPerPerson()`: per-guest items count once, **group-priced items divide by the trip split** (verified: $700/group ÷ 14 = $50) |
| 3.4 | Experience density as home signal | NOT BUILT — per scout.md §5 this must be a **heuristic** computed in code, never folded into the home-ranking prompt |

### Phase 4 — vibe chips SHIPPED 2026-08-11 (rest still stretch)
- **Vibe chips** (`EXP_VIBES` in ExperiencesSection): Airbnb's long-tail categories
  folded into 6 vibes (food/outdoors/water/culture/nightlife/wellness) matched on
  category+title. Only vibes with ≥2 matches render, each with a live count; desktop
  chip row + mobile `.fchips` scroller; `experiences_vibe_filtered` event.
  Live counts on the LA board: Outdoors 13 · Culture 15 · Food 6 · Water 4 · Nightlife 3.
- **Assign-to-day SHIPPED**: `GET/POST .../exp-days` (+ `GET .../days` for the trip's
  day list) store `experienceId → YYYY-MM-DD`, validated inside the trip window.
  Day chips in the dialog pin an activity ("we're doing the hike Thursday"),
  optimistic with rollback; pinned day shows as a badge on the card.
  **A human pin beats Scout**: `expPlanToItinerary(plan, byId, pins)` re-homes pinned
  items onto their chosen day, creates the day if Scout didn't use it, drops empties,
  sorts by date, no duplicates (logic verified by simulation).
  `experience_day_pinned` event.
- Still stretch: more sources (Viator/GetYourGuide) · availability checks.

### Phase 5 — personal lane + shareable plans (SHIPPED 2026-08-11)
The loop the product was missing: **everyone builds their own plan privately, then
drops a link in the group chat.** Group lane = the vote leaderboard; personal lane =
your saves → your Scout plan → your share link.
- **Save an experience** (bookmark on the card) → `exp-saves.json` keyed by userId,
  mirroring homes favorites. Private. `GET/POST .../exp-saves`, optimistic toggle.
  A "Saved N" lens chip filters the grid to just yours.
- **Select-to-plan**: a ✓ on each card builds a selection; Scout plans exactly those
  (falls back to all your saves when nothing is ticked). This was the user's pick over
  auto-from-votes.
- **`POST .../my-plan`** — the personal counterpart of the group Plan job. Stored per
  user in `exp-myplans.json` so it can be shared without touching the group plan.
  Same guards + `heuristicPlan` fallback as the group job (scout.md §2/§3).
- **Share page `/s/plan/:tripId/:userId`** — unlike the other `/s/*` routes this
  RENDERS the itinerary (self-contained HTML, own styles, OG image from the first
  activity) because the point is that people read it in the thread without the app.
  Client uses `navigator.share` with a clipboard fallback.
- **Reveal animation**: `.xplan-day` staggers in (70ms per day) via the existing
  `gp-panel` keyframes.
- **PDF export** — `GET /s/plan/:tripId/:userId.pdf` renders the same share page with
  the **Chromium already in the image for scraping** (playwright-core, no new dep):
  Letter, `printBackground`, 12–14mm margins. **Route order matters**: it is declared
  BEFORE the HTML route or Express's `:userId` swallows the `.pdf` suffix.
  Rate-limited 10/5min, 20s timeout; on failure returns a plain-English 503 pointing
  at browser Print → Save as PDF (never a corrupt download). A `@media print` block
  flips the page to an ink-friendly light theme, hides the Open/CTA/toolbar chrome,
  and sets `break-inside: avoid` so a day never splits across pages; `?print=1`
  also strips that chrome server-side. Buttons: "PDF" in the My-plan panel, plus
  Download PDF / Print links on the share page itself.
  Verified: valid `%PDF-1.4` output and a print-mode render of a representative plan.

### THE popup bug — real root cause (2026-08-11)
Symptom: "just the dark screen, can't see the actual popup." Cause: `.tab-panel`
animates `transform`, and **an element with an animating transform becomes the
containing block for `position: fixed` descendants** — so the inline modal's
`inset: 0` sized to the panel, not the viewport; the scrim painted but the card
landed clipped/off-view. No amount of CSS on the modal could fix it.
**Fix: render through a Radix portal like the homes `DetailModal`**, and reuse the
`.dx` grid so it's landscape on laptops (verified live: 1060×564, portal parent
`BODY`, two columns). Never render a fixed-position overlay inside `.tab-panel`.

### Leaderboard restyled as a list (2026-08-11)
The borrowed homes `.leaderboard`/`.lb-bar` markup looked wrong here: with a single
entry it rendered a full-width gold bar for "1 like", and its title repeated the
section header directly above it. Replaced with a dedicated `.xlb-*` block in
`ds2/board.css` — a ranked **list**: rank + 40px thumbnail + title + meta
(price · duration · pinned day) + like count, with support shown as a subtle tint
filling each row (`--pct` custom property, animated) instead of a dominating bar.
Title is now "Top of the list" (no longer duplicates the section header). Same
component on mobile. Note `.xlb-main` must be `display:flex; flex-direction:column`
— the name/meta are `<span>`s and ran together on one line without it.

### Desktop board de-cluttering (2026-08-11)
The board header was three dense rows and the "Things to do" tab wrapped onto two
lines, making the whole tab bar ragged. Fixes:
- Tab renamed **"To do"** (matches the mobile nav) + `white-space: nowrap` on `.tab`
  so no label can ever wrap again.
- **The homes toolbar (Add a home / Refresh / Filters / split / count) now renders
  only on home tabs** — it was showing on Things-to-do and Discussion where none of
  it applies, which also put *two* Refresh buttons on screen at once. Same for the
  mobile quick-filter scroller.
Verified live: all six tabs on one line, toolbar hidden on To-do, one Refresh.

### Dialog + navigation fixes (2026-08-11)
- **Experience dialog was visually broken on mobile** — content clipped off-screen,
  icons wrapping to their own lines, oversized close button, no internal scroll.
  Root cause: it borrowed card-grid classes (`.specs`/`.title`) and used inline
  styles instead of real CSS. Fixed with a scoped `.xd-*` block in `ds2/detail.css`
  (flex column, `max-height: min(86dvh,720px)`, scrolling `.xd-body`, pinned
  `.xd-actions`, house `.modal-x` close). Verified: 698px tall, fits the screen,
  actions always reachable.
- **Mobile chrome de-congested.** The top bar was squeezing the trip name to
  "Los Angele…" behind 4 icons (+2 more for owners). Now: back + full trip name +
  a single **⋯ More** sheet (Chat, Saved, theme, owner refresh/manage, tour).
  **"To do" was promoted from a cramped top-bar icon to a real bottom-nav
  destination**: Homes · Shortlist · [+] · To do · Decision.

### Out of scope (permanent, unless strategy changes)
Booking/payments · marketplace mechanics · real-time availability · reviews ingestion.

## 4b. End-to-end test pass (2026-08-11)

**Bugs found and fixed during the sweep:**
1. **Scout's-plan and My-plan panels rendered completely unstyled on desktop.**
   `.ai-card` is defined as `.gp-mobile .ai-card` in mobile-app.css — a mobile-only
   selector I reused on desktop. Added `.tab-panel .ai-card` equivalents in board.css.
   *Lesson: check the selector prefix before reusing a class across shells.*
2. **Save and Select buttons stacked on top of each other** on experience cards
   (both at right-offset 53px → one unclickable). Cause: I positioned the select
   button at `right: 52px`, but the base CSS ALREADY separates them
   (`.card .save-btn` right:52px, `.card .star-btn` right:10px). The fix was to
   DELETE my override, not add another. Verified after: 53px / 11px.

**Verified working (guest, prod):** API guards (all mutating routes 401 for guests,
open reads 200) · 40 records with zero missing fields / duplicates / malformed URLs ·
21 discounted · leaderboard + Scout plan render · vibe filter round-trips
(40 → 15 Outdoors → 40) · dialog opens landscape 1044×617 within viewport with price,
day chips, reviews and Airbnb link · ESC closes · **zero JS errors** · mobile shell
375×812: 4-item bottom nav, un-truncated title, 2-button top bar, 40 cards, dialog
fits width (369px) · PDF route 404s cleanly for a missing plan.

**Not covered (needs a signed-in session):** saving, select-to-plan, building/sharing
a personal plan, the PDF with real content, and casting a real vote. These were
exercised at the API layer only. Worth a manual pass once signed in.

**Latent risk — FIXED 2026-08-11.** A refresh replaced the whole list, so an
experience the group had engaged with could vanish while its votes lingered
invisibly. `scripts/run-experiences.js` now carries forward any dropped row that
has a vote, a save, or a pinned day, flagged `retained: true`. Verified: voted and
pinned rows survive, an empty vote object does NOT count as engagement, no dupes.

### Signed-in E2E pass (2026-08-11, real account)
Verified with a live organizer session: leaderboard shows "you liked" · Scout's plan
renders with per-item reasoning · **My plan produced a real 3-day itinerary**
(Pickle tasting Tue → Hollywood Sign hike Wed → surf lesson Thu, each with a why) ·
save/select overlay buttons correctly separated · **public share page 200s with no
auth** (3 days, 3 activities, OG image, CTA, PDF+Print links) · `?print=1` hides the
chrome · **PDF renders with real content**.
Two anomalies found and fixed:
- "My plan · **0 saved**" was shown while a 3-day plan existed → now reports
  "N activities over N days" when a plan is present.
- **PDF was 4.5 MB** because the share page embedded full-resolution photos into
  52px thumbnails → now requests `?im_w=240`. **335 KB, a 93% reduction.**

## 4c. Open gaps found by the design-handoff audit (2026-08-11)
Design packet: **[experiences-design-handoff.md](experiences-design-handoff.md)**.
Writing it surfaced real functional gaps, not just visual ones:
1. **Mobile has none of the personal lane.** `todoView` in MobileBoard has no save
   button, no select-for-Scout, no Saved lens, no Scout's-plan or My-plan panel, no
   share and no PDF. **Scout is unreachable on a phone** — and "share my plan into
   the group chat" is a phone behaviour that today only exists on desktop. Highest
   priority gap.
2. **Scout is unreachable until someone votes**, even on desktop: the actions live
   only in the populated leaderboard branch.
3. **No error states anywhere** — every read is `.catch(() => {})`, so a failed
   fetch is indistinguishable from an honest empty (mirrors audit GP-A24).
4. **Dead CSS**: `.xd`, `.xd-photo`, `.xd-body`, `.xd-title` in detail.css are
   leftovers from the pre-portal sheet, referenced by no TSX.
5. `.card .badge-row` is `space-between` with no `flex-wrap` (inherited from homes)
   while the experience card can carry up to 5 badges.
6. The "selected for Scout" state is nearly invisible — `.card.is-selected` sets
   `outline: none`; only the small check icon changes colour.

## 5. Open items
- **Distance anchor (2.2/2.3, settled 2026-08-11):** homes do NOT reliably carry
  lat/lng — curated `listings.json` and the pipeline rows have none (only the
  precomputed `distances` chips + `distance_mi`); submitted homes often do (JSON-LD
  scrape / geocode fallback in server.js). So the client anchors distances on the
  best available point via `expAnchor()` (client/src/lib/utils.ts): the home's own
  coords when present → "X mi from your place"; else the trip's PRIMARY ref point
  (downtown → airport → attraction) → "X mi from <ref name>", never faking
  home-level precision. `tripView` now exposes `ref_points` (LA = the fixed
  LA_REFS). Distances are straight-line haversine (no 1.25 road factor — the label
  says "from", not "drive"). No anchor → all distance UI hidden.
- Coords agent result → paste findings here (approach, JSON path, cost/lookup).
- Category filter chips: Phase 1.7 nice-to-have if trivial, else Phase 4.
- Whether "Things to do" shows a pip (count) on the tab like Discussion does.

## 6. Design polish (later)
A dedicated Claude-design pass will restyle the Experiences surface once the feature
is proven. Until then: strict ds2 reuse, zero bespoke CSS beyond what card layout needs.

## 4d. Multi-source: id namespacing + OpenStreetMap (SHIPPED 2026-08-11)

**Namespaced ids (the prerequisite).** Ids were the bare provider id (`3951041`)
and key FIVE stores — votes, saves, day-pins, reviews, my-plans. Any second source
with numeric ids would have collided across all five and landed a member's vote on
the wrong activity. Rows now carry `id: "airbnb:3951041"` + a `source` field;
OSM uses `osm:node/123`.
- `migrateExperienceIds()` runs at boot, once per trip, guarded by a
  `.exp-ids-namespaced` marker. It rewrites keys in exp-votes / exp-days /
  exp-reviews, array ids in exp-saves, nested `days[].items[].id` in exp-myplans
  AND exp-plan, and the rows in experiences.json.
  **Live result: 20 changes on la-birthday-2026, the existing up-vote preserved.**
- The reviews route's id check moved from `/^\d+$/` to `/^[a-z]+:[A-Za-z0-9/_-]+$/`,
  and now 204s for non-Airbnb rows (guest reviews are an Airbnb-page scrape).
- Detail fetches strip the namespace (`rawAirbnbId`) before hitting Airbnb URLs.

**OpenStreetMap as source 2** (`osm.js`) — free things to do (parks, beaches,
viewpoints, museums, landmarks) that no marketplace sells. ODbL, no key, no wall.
Everything below was MEASURED from the Railway container, not assumed:
- A browser-ish User-Agent gets **406** — send a descriptive app UA and POST the query.
- **Query cost dominates.** A 25km bbox with 7 node/way clauses 504s on kumi and
  private.coffee, and overpass-api.de returns **200 with ZERO elements** (it times
  out server-side yet still reports success). The lean **12km / 3-clause `nwr`**
  form returns 200 with ~50 elements in ~15s. So "200 but empty" is treated as a
  failure worth retrying on the next mirror.
- Mirrors are ordered by observed behaviour and all three are tried; 40s timeout.
- ~15s latency → background runner only, never a request path.
- The search is centred on the **median of the Airbnb rows' coordinates**, so no
  geocoder is needed and it lands where the activities actually are.
- Purely additive: if Airbnb returns 0 but OSM answers, the previous Airbnb rows
  are kept rather than replacing the board with parks only (all four failure
  modes unit-verified).

**UI is source-aware**: the outlink reads "Open on OpenStreetMap", and since OSM
has no pricing the card says "Free" only when `fee=no` says so, else "Free or
ticketed — check the site" — never a fabricated price.

**Live on the LA board: 73 rows — 41 Airbnb + 32 OSM, zero id collisions, 32/32
OSM rows with coordinates** (Venice Canal Historic District, Autry Museum,
Griffith-area viewpoints…), and the engaged-row carry-forward fired correctly.

---

## 4e. Source 3 — Viator Partner API (BUILT 2026-08-13, dormant pending a production key)

`viator.js` adds bookable tours & activities: the tier Airbnb (scraped) and OSM
(free/open) can't cover. It is a **sanctioned API**, so unlike GetYourGuide,
Klook and Viator's own website — all of which returned 403 from our Railway IP —
it can't be walled off from under us.

### Contract (verified against Viator's own Basic-access Postman collection, not memory)
Downloaded from `docs.viator.com/partner-api/technical/Viator-Basic-Access-Affiliate-API-v2.postman_collection.json`.

* base `https://api.viator.com/partner` (sandbox `api.sandbox.viator.com/partner`)
* headers `exp-api-key`, `Accept: application/json;version=2.0`, `Accept-Language: en-US`
* **Basic access allows exactly**: `POST /products/search`, `GET /products/{code}`,
  `GET /products/tags/`, `POST /attractions/search`, `GET /attractions/{id}`,
  `GET /availability/schedules/{code}`, `POST /search/freetext`,
  `POST /locations/bulk`, `POST /exchange-rates`, `GET /destinations/`.
* `/destinations/` and `/products/tags/` want their **trailing slash** — the
  collection has it, so we send it.

### How it works
1. Trip destination string → destination id via `GET /destinations/` (matched on
   the text before the first comma; a CITY beats a REGION of the same name).
   Cached to disk 30 days — it's ~2MB of static reference data.
2. `POST /products/search` filtered by that destination (plus the trip dates when
   both are known), sorted `TRAVELER_RATING DESCENDING`, count ≤50.
3. `GET /products/tags/` (cached) maps numeric tag ids → labels so cards get a
   real category for the vibe chips. No label resolvable → `category: null`,
   never an invented "Tour".

### Two traps that cost real time here
* **A newly issued key is not live.** The dashboard says plainly *"It can take up
  to 24 hours for the key to be active"*; until then every call returns
  `401 UNAUTHORIZED / Invalid API Key` — indistinguishable from a wrong key. The
  401 branch in `call()` says so in the error text so nobody re-debugs this.
* **Sandbox keys serve a small fixed TEST catalogue**, which would look
  indistinguishable from real inventory on a live board. `searchViatorExperiences`
  therefore **refuses to return rows when the base URL is a sandbox host** unless
  `VIATOR_ALLOW_SANDBOX=1`. Real inventory needs a **production** key, which the
  partner account only unlocks after contact details are filled in.

### Known gap (deliberate)
Product **summaries carry no coordinates** — location lives on `/products/{code}`
behind a `/locations/bulk` ref lookup, i.e. ~30 extra calls per refresh. So Viator
rows show no distance chip and don't participate in "Nearest" sort, exactly as
Airbnb rows whose coord lookup failed. Worth adding once the key is live and a
real payload can be inspected; writing that plumbing blind is how it breaks.

### Status
Code complete, wired into `scripts/run-experiences.js` as an additive third
source (same empty-source guards and engaged-row carry-forward as OSM), mapping
verified against fixture payloads, client `expSourceLabel`/`ExpPrice` are
source-aware ("Open on Viator", "See price on Viator"). **`VIATOR_API_KEY` is NOT
set in Railway** — deliberately, because the only key we hold is a sandbox one.
The integration is inert until a production key exists.

---

## 4f. The Claude Design redesign — Phase 1 (SHIPPED 2026-08-13)

Handoff: `Groupad_Experince_design.zip` → `design_handoff_experiences/`. It
scoped four surfaces and named the trade-offs; below is what was implemented and
where a decision differed from the doc.

### 01 · The card → variant **A (Quiet) + C's denominator**
The doc offered three variants and recommended A, with C's denominator borrowed
in. Done exactly that:
* **One badge on the photo, and only an urgency one** — `Save $X`, else
  `Group rate`, else nothing. Category / rating / duration / distance became
  **type** (`.xmeta`), which is what killed the mid-word clipping: the old
  `.badge-row` was `space-between` with no wrap, so at four columns five badges
  truncated to "Save 3", "Group r", "On the wa". The experience card no longer
  renders `.badge-row` at all (homes still do — that rule was NOT deleted
  globally, only stopped being used here).
* **One overlay, not two.** Save keeps the photo; select-for-Scout became a
  **mode** the My-plan panel turns on (`pickMode`), so selection can be
  unmistakable (accent ring + tinted photo + filled box) instead of a second
  34px circle that looked identical to Save.
* **`N of 14 would go`** on every card with support — the same honesty fix the
  leaderboard needed, stated per card.
* Pinned days get their own accent chip: a human commitment outranks metadata.

### 02 · Panels → one shell, three kinds
`.xp` + `.k-group` (solid, authoritative) / `.k-scout` (tinted, labelled
**Scout · proposal**) / `.k-mine` (inset, **Private to you**). The button that
writes to the shared itinerary stays owner-only.

### 03 · Scout's plan as a **routed day** ⭐
Reference: Wanderlog / Google Maps / Citymapper — the one thing they all ship
and a grouped list never does is the travel *between* stops. Rendered as a spine
of `stop → leg → stop` with clock times in `--font-mono`, per-stop facts, the
`why`, and a day wrap stating the three numbers that decide whether a day is
sane (time out, time driving, cost pp). Both renderings ship; `List` is kept as
the compact read.

**Two decisions that differ from the mock, deliberately:**

1. **The server computes every number; Scout only orders and explains.**
   `routeDay()` derives clock times, leg distances (haversine × 1.35 road
   factor), drive minutes (22 mph city average) and the day totals. Asking a
   model for clock times produces days whose arrival times, reasoning and totals
   contradict each other — and internal consistency is the one thing a plan has
   to have. Travel times are labelled `~` because they are estimates: we have no
   routing provider, and a fabricated-precise "14 min" is worse than an honest
   approximation. Wire a real routing call here later and only `dur`/`mi` change.
   *Consequence found in testing:* Scout's `why` could still contradict the
   computed clock ("clear-sky night" on a 9:50a stop), so the Plan prompt now
   **forbids time-of-day claims in `why`** and says why.
2. **No invented filler stops.** The mock adds "Coffee at République" tagged
   *Scout added*. We have no venue database, so that would be fabricating a
   recommendation for a named real business. Gaps are named instead — which the
   handoff already mandates ("Gaps are named, not filled").

`route` is computed at **read** time, never stored: votes, pins and the decided
home all move underneath a plan that is otherwise still valid.

### 04 · Leaderboard → absolute support + quorum
Fill is now `net ÷ party size`, not `net ÷ current leader` — one vote of
fourteen reads as 7%, not 100%. A quorum line names the denominator out loud
("1 of 14 have voted"), and N=0 is a **teaching state**, not an empty box.

### 05 · Four states, not one
`AppContext` used to swallow the experiences read into an empty list, so a
server outage rendered as "no things to do found" — the product blaming the
group's trip for its own failure, with no way back. Now `expFailed` splits
pending / honest-empty / filtered-empty / **error**, and the error says it is
ours, that votes are safe, and offers `retryExperiences()` (re-reads the slice,
as opposed to `refreshExperiences()` which asks the server to re-scrape).

### Also fixed while in here
* Photo-less rows (most OSM ones) were reserving half the dialog for an empty
  400px black column — the landscape grid now collapses via `.dx.xd-nophoto`.
* "That's a wrap for **Tuesday**", not "Tue" — the one line of plain speech in
  the panel read like a log entry.

### Not in this pass (Phase 2/3 per the handoff)
Mobile To-do parity, the detail-dialog order, the public share page, the tab bar.
**Mobile still renders the old card**, so the desktop and mobile To-do tabs now
differ — that is the top follow-up.

---

## 4g. Splitting the To-do tab: Browse | Plan (SHIPPED 2026-08-13)

The redesign fixed the card but not the *page*: the tab was doing three jobs
stacked vertically — browse & vote (everyone, constantly), read the ranking (a
summary), and plan (one or two people, occasionally) — so you scrolled past two
tall panels before reaching a single item.

**The rule:** browsing is divergent (scan widely, react) and planning is
convergent (commit to a sequence). Different modes get different screens. That
is what Wanderlog (Explore vs Itinerary), Google Travel (Explore / Saved /
Trips) and Airbnb (browse vs Wishlists) all ship — discovery and itinerary are
*always* separate destinations in this category.

**Segmented control, not a 7th tab.** The board's top nav was de-congested once
already (§ mobile chrome, 2026-08-11); adding "Plan" up there would undo it. A
segment inside To-do gets the same separation, and it is the control iOS and
Android already train people on, so it ports to mobile unchanged.

**Not a modal.** A routed day is long, scrollable, referential and shareable —
you read it *against* the items. Modals are for short focused dismissible
tasks; a two-day itinerary in a dialog means no deep link, no share target and
a scroll inside a scroll. Modals stay where they already work: the
single-experience detail.

### What's on each
* **Browse** — the vibe chips and the grid, plus ONE row above them: the
  **leader bar** (`.xlead`, ~44px). Rank 1, the honest denominator, and the way
  into Plan. This is deliberate: voting has to visibly do something or people
  stop doing it, and moving the whole leaderboard away would leave the browse
  view silent. Sorting and Refresh live here too — they act on the grid.
* **Plan** — the full leaderboard, Scout's proposal, then My plan, in that
  narrative order (the group's answer → a machine's proposal → your own
  version). Capped at `980px`: a reading surface, not a grid.

A quiet accent **dot** on the Plan segment when a plan exists — it says
"something is here" without shouting at someone mid-browse.

**My plan now renders as a routed day too** (`withRoutes` applied to both
`my-plan` responses) — it is the same kind of object, and a personal plan is
the one you actually walk.

### 4g-bis. The personal lane is the point — fixing what the split broke

Splitting Browse/Plan introduced a workflow break I'd created myself: **mixing
and matching happens against the ITEMS**, but the "Pick for Scout" switch was
sitting in the My-plan panel, which now lives in Plan — a view with no items in
it. You'd have had to leave the grid to turn on selection, then come back.

My plan is the flagship personal feature (mix and match what *you* think is
good, then share it to the group and compare), so:

* **The switch moved to the chips row in Browse** — "Build my plan" sits with
  the filters, because choosing what to include *is* a filter on intent.
* **A sticky bulk-action bar** (`.xpickbar`) tracks the selection while you
  scroll the grid: `N selected · Clear · Plan my days`. Same pattern as Gmail /
  Figma / Photos multi-select. "Plan my days" builds and jumps to Plan — but
  **only on success**; `buildMyPlan()` now returns a boolean, because sending
  someone to an empty Plan view after a failure is worse than leaving them put.
* The My-plan panel's button became **"Pick things" / "Change picks · N"**,
  which switches to Browse with pick mode on, rather than pretending you can
  pick from a panel with no cards.
