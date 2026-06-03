# GroupPad — Site Map, Pages & Data Models

> **Purpose of this doc:** the single source of truth for the **redesign phase**.
> It describes every page, every component, every data model, the API, the roles,
> and the search/cost systems as they exist *today* (post multi-trip rewrite).
>
> **What GroupPad is:** a product for planning a group trip together. Anyone signs
> in, **creates a trip**, invites their group by link, and runs a shared board to
> **collect rentals → like → shortlist → compare with AI → vote → lock the winner.**
>
> **Live:** https://exquisite-inspiration-production-7511.up.railway.app
> **Stack:** React 18 + TypeScript + Vite + Tailwind + Radix (`client/`), Express
> backend (`server.js`) on Railway. Client uses **HashRouter** (backend has no SPA
> fallback). Routes look like `/#/t/:tripId/board`.

---

## 1. Architecture at a glance

```
client/  (Vite React+TS, builds to client/dist, served by Express)
  src/
    store/AppContext.tsx     ← global account + active-trip state (the one store)
    routing/TripGate.tsx     ← loads a trip from the URL, handles join-by-link
    lib/{api,utils,cn}.ts     ← typed API client, formatters, classnames
    views/                    ← one file per page (Landing, Trips, CreateTrip, Board, Manage, Help, Admin)
    components/
      chrome/                 ← Navbar, Footer, BoardHeader
      board/                  ← FilterBar, SubmitBar, SearchPanel, Itinerary, Decision,
                                 Shortlist, Submitted, Caveats, Pipeline, CompareDock
      modals/                 ← Auth, Onboarding, Detail, Comparison
      ui/                     ← Button, Dialog, Checkbox, Slider, Badge, ToastStack (shadcn-style)
      Card.tsx, Carousel.tsx, Markdown.tsx
server.js   ← all /api routes, per-trip JSON storage, auth, AI compare, search spawning
pipeline.js ← Apify scrapers: LA full pipeline (SQLite) + per-trip search (TRIP_ID mode)
data/       ← trips.json (registry), trips/<id>/*.json (per-trip), users/sessions/usage (global), pipeline.db
```

**Persistence:** flat JSON, atomic writes, no cache. Trip-scoped stores live in
`data/trips/<tripId>/`; the **LA trip is special** — its `tripId` is
`la-birthday-2026` and it reads the legacy flat files in `data/` (migrated in
place, nothing moved). Global stores: `users.json`, `sessions.json`, `magic.json`,
`usage.json`, `trips.json`. The **LA pipeline** uses SQLite (`pipeline.db`).

---

## 2. Roles (who sees / can do what)

| Role | How you get it | Can |
|------|----------------|-----|
| **Visitor (signed-out)** | open any trip link | **view** the board (listings, prices, distances), browse — nothing that writes |
| **Member** | sign in + open an invite link (auto-joins on first vote/add) | vote 👍/👎, ⭐ top-choice, add listings, post caveats, run AI compare |
| **Organizer** | you **created** the trip (`trip.owner_id === you`) | everything a member can + post itinerary, delete listings/caveats, lock the ✅ official pick, run/再-run the search, see invite link + group pulse, **delete the trip** |
| **Platform super-admin** | hold the `x-admin-key` (env `ADMIN_KEY`) | the platform usage meter (`/#/admin`), cross-trip logout. **Site manager = gold.nwobu@gmail.com** (`OWNER_EMAIL`) — gets Apify-limit alert emails. |

Access model: **invite-link, view-by-link.** Trip ids carry random entropy
(unguessable) and are the view secret; `join_code` (owner-only) gates joining.

---

## 3. Pages / routes

### 3.1 `/#/` — Root
Signed-in → redirect to `/#/trips`. Signed-out → **Landing**.

### 3.2 Landing (`LandingView`) — signed-out marketing page
- Hero ("Pick the place your whole group actually agrees on"), pill badge.
- CTAs: **Get started** (→ Google sign-in or, if signed-in, create-trip), **Sign in**, **30-second tour** (onboarding modal).
- 3 "how it works" step cards (Browse & like / Shortlist & compare / Pick the winner).
- CTA band at the bottom.
- *Redesign note:* this is the product's front door — currently functional/plain.

### 3.3 Trips dashboard (`/#/trips`, `TripsView`) — requires sign-in
- "Your trips" + **New trip** button.
- Empty state ("No trips yet" + Create your first trip).
- Grid of trip cards: name, destination, dates, member count, **organizer** crown badge. Click → that trip's board.

### 3.4 Create trip (`/#/trips/new`, `CreateTripView`) — requires sign-in
Form fields → `POST /api/trips`, then redirect to the new board:
- Trip name (optional), **Destination**, **Check-in / Check-out**, **Guests**,
  **Bedrooms** (optional, drives search min/max), **Budget**, **Home type** (select),
  **Itinerary** (optional textarea — saved before search, feeds reference points + AI).
- On create, a capped rental **search auto-fires** (if Apify under limit).

### 3.5 Board (`/#/t/:tripId/board`, `BoardView`) — the core app
Loaded via `TripGate` (handles loading / 404 / `?join=code` auto-join). Top→bottom:
1. **BoardHeader** — trip name, dates, guests, budget, "N homes (M under budget)", **Manage trip** button (organizer).
2. **Join banner** (visitors/non-members) — "viewing as a guest · Sign in to join".
3. **FilterBar** (sticky) — Under-budget / Pool / Parking / Include "check manually" checkboxes; **split slider** (per-person cost); count.
4. **SubmitBar** — "Add a listing": paste any Airbnb/VRBO/Booking URL (+ optional price), "open with trip dates" helper.
5. **SearchPanel** (organizer) — "Finding rentals in <dest>…" while searching; empty-state "Search <dest> rentals" button; "Find more rentals" once populated.
6. **Itinerary** — collapsible; organizer editor (textarea, upload .txt/.md, save, clear). Feeds AI compare.
7. **Decision** — pinned ✅ official-pick banner OR the ⭐ top-choice leaderboard (bars), organizer "Make official"/Unlock.
8. **Shortlist** (homes with net-likes ≥ 1) — **Compare with AI** panel (free-text criteria, whole-shortlist analyze, 1v1 / compare-selected, group insights w/ staleness banner) + the shortlisted cards.
9. **Community Submissions** — member-added homes not yet liked.
10. **Group caveats** — must-haves/dealbreakers chat (feeds AI ranking).
11. **Main grid** — the curated/searched homes (filtered).
12. **Live Listings** (LA only) — auto-scraped, "refreshed every 3 days".
- Floating: **CompareDock** (when cards ticked), **ComparisonModal** (the VS layout).

### 3.6 Manage (`/#/t/:tripId/manage`, `ManageView`) — organizer only
- **Invite link** (with `join_code`) + copy button.
- **Group pulse** stats: members, homes, votes, top-picks.
- **Danger zone:** Delete trip (confirm → removes registry + all per-trip data).

### 3.7 Help (`/#/t/:tripId/help`, `HelpView`)
5 static explainer cards (like vs top-choice vs official pick, browsing, adding, AI/caveats, signing in).

### 3.8 Platform admin (`/#/admin`, `AdminView`) — super-admin key
API usage meter (Gemini tokens/est cost, Firecrawl credits, Apify spend vs limit + recent runs, group pulse). Key entry if not set.

### 3.9 Global overlays (mounted in `App.tsx`)
- **AuthModal** — Google button + email magic-link (inline validation).
- **OnboardingModal** — 5-slide tour (once via `localStorage.gp_onboarded`, replayable).
- **DetailModal** — gallery + thumbnails, specs, **3 distance+time rows**, price breakdown, per-person, amenities, embedded map, vote/top-choice/official actions.
- **ComparisonModal** — picked homes as columns with a **VS** divider (1v1) or a grid (multi), AI verdict below; dismiss clears selection.
- **ToastStack** — non-blocking toasts.

---

## 4. The Card component (used in 4 grids)
`Card.tsx` — photo carousel, rank/community/live + budget badges, name, source +
area, **distance+time pills** (`📍 9mi · 19min  ✈️ 5mi · 7min  🎡 19mi · 38min`;
falls back to "X mi to downtown" if no `distances`), specs (bd/ba/sleeps),
amenity chips, reviews, price "est all-in" + per-person split, note, compare
checkbox, "View on <source>" link, 👍/👎 vote bar, ⭐ top-choice, organizer
"Make official" + Delete.

---

## 5. Data models

**Trip** (`data/trips.json`, keyed by id):
```
id, name, destination, checkin, checkout_5n, checkout_4n, adults, budget,
bedrooms?, home_type?, tax_rate, cleaning_placeholder, owner_id, members[],
join_code (owner-only in API), created_at, refreshed_at, ref_points?
ref_points = { downtown|airport|attraction: { name, lat, lng } }   // for distances
```
API returns a **TripView**: trip minus `members/owner_id/join_code` for non-owners,
plus `isOwner`, `isMember`, `memberCount`.

**Listing** (curated `listings.json`, per-trip `trips/<id>/listings.json`, pipeline SQLite, or submissions):
```
id, source, url, name, area, distance_mi,
distances: [{ icon, kind, label, mi, min }],   // 3 distance+time chips
bd, ba, sleeps, pool, parking, hot_tub, rating, reviews, superhost?,
budget ('under'|'marginal'|'over'|'unknown'), check_manual,
displayed_5n, est_5n, est_4n, photos[], amenities[], note?,
rank? (curated), submitted_by?/submitted_at? (submissions), last_seen?/enriched? (pipeline)
```

**Votes** `{ [listingId]: { [userId]: 'up'|'down' } }` · **FinalState**
`{ counts, total, myPick, decision:{listing_id,locked_at}|null }` · **Caveat**
`{ id, user_id, name, text, created_at }` · **Itinerary** `{ text, updated_at }` ·
**Insights** `{ analysis, ids[], created_at }` · **User** `{ id, email, name }`.

---

## 6. API surface (all `/api`)

- **Auth (global):** `GET /auth/me`, `POST /auth/request-link`, `GET /auth/verify`, `PATCH /auth/me`, `POST /auth/logout`, `GET /auth/google(+/callback)`.
- **Trips (global):** `GET /me/trips`, `POST /trips` (create + auto-search), `GET /trips/:id`, `POST /trips/:id/join`, `POST /trips/:id/leave`, `DELETE /trips/:id` (owner), `GET /trips/:id/pulse` (owner), `POST /trips/:id/run-search` (owner), `GET /trips/:id/search-status`.
- **Trip-scoped entities** (`/trips/:id/…`, read = open, write = auth + auto-join, owner-only where noted): `listings`, `DELETE listings/:lid` (owner), `votes` (GET/POST), `submitted`, `submit` (POST), `DELETE submitted/:lid` (owner), `pipeline-listings`, `itinerary` (GET / POST-owner), `caveats` (GET/POST / DELETE-owner), `insights`, `compare-listings` (POST), `final`, `final-vote` (POST), `decision` (POST-owner).
- **Legacy aliases:** the old flat routes (`/api/listings`, `/api/votes`, …) still resolve to the LA trip for back-compat.
- **Platform admin (x-admin-key):** `GET /admin/verify`, `GET /admin/usage`, `POST /admin/run-pipeline`, `POST /admin/logout-all`.

---

## 7. Search & cost system

- **New trips** are populated by `pipeline.js` in **TRIP_ID mode**: searches the
  trip's destination (Airbnb fast scraper), caps results (`TRIP_SEARCH_MAX`,
  default 10), min/max bedrooms from the form, ranks under-budget + cheapest
  first, asks **Gemini for 3 reference points** (downtown/airport/attraction,
  itinerary-aware), computes distance+time per listing, writes the trip's own
  `listings.json`. A `.searching` marker drives the board's progress UI.
- **The LA trip** uses the full `pipeline.js` (SQLite, VRBO + Airbnb) on a **3-day
  schedule**; it now also computes the 3 distances during discovery.
- **Cost controls:** LA Airbnb default cut to **1 county-wide query** (~$0.34/run);
  trip-search over-fetch trimmed to ~16. An **Apify guard** runs before every
  scrape — at ≥85% of the monthly limit it **pauses the run and emails the site
  manager** (`OWNER_EMAIL` = gold.nwobu) to rotate `APIFY_TOKEN`.

---

## 8. Client state (localStorage) & env

- localStorage: `admin_key` (platform super-admin), `gp_onboarded` (tour seen).
- Cookie: `gp_session` (HttpOnly, 30-day) — identity via `GET /auth/me`.
- Key env on Railway: `APIFY_TOKEN`, `GEMINI_API_KEY`, `RESEND_API_KEY`,
  `MAIL_FROM`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `ADMIN_KEY`,
  `OWNER_EMAIL` (site manager / LA owner), `AIRBNB_LOCATIONS`, `TRIP_SEARCH_MAX`,
  `PIPELINE_INTERVAL_DAYS`, `APIFY_ALERT_PCT`.

---

## 9. Redesign priorities (observations to carry in)

1. **Board is dense** — 12 stacked sections. The biggest design win is a clearer
   hierarchy / progressive disclosure (e.g. collapse advanced sections).
2. **Emoji as structural icons** (📍✈️🎡, badges) — the ui-ux-pro-max skill flags
   this; consider an SVG icon set for the chrome while keeping emoji where they're
   intentionally playful.
3. **Landing + Trips dashboard** are functional but plain — prime for a real
   product visual identity (brand, type scale, color system).
4. **Distance pills, budget badges, rank badges** are a good component system to
   formalize into tokens.
5. **Mobile**: verify the board's sticky filter bar + dense cards on small screens.
6. **Empty/loading/searching states** exist but are minimal — good redesign surface.
```
