# GroupPad — Handoff / Continue-Here

> **Read this first when resuming in a new session.** It's the all-in-one state of
> the project: where it lives, what's done, how to run/deploy it, and the design
> phase that's next (with a paste-ready Claude Design prompt).

---

## 0. What GroupPad is
A live product where a group of **any size** picks **one** vacation rental together:
browse rentals → like → shortlist → compare with AI → vote → lock the official pick.
Multi-trip: anyone signs in, **creates a trip**, invites the group by link.

---

## 1. Coordinates

| | |
|---|---|
| **Local folder** | `/Users/goldnwbou/Documents/Flight_Search` (legacy name; it IS GroupPad) |
| **GitHub** | `github.com/goldhac/grouppad` — branch **`main`** is canonical & current |
| **Branches** | `main` ≡ `redesign-prep` (latest). `react-migration` is older history. |
| **Live URL** | https://exquisite-inspiration-production-7511.up.railway.app |
| **Host** | Railway · project `8a93dc1e-a963-426f-9f34-77619a6cb66d` · service `2c54cbaa-b872-41dc-b95a-15c75e7417b8` (name `exquisite-inspiration`) |
| **Owner / site manager** | `gold.nwobu@gmail.com` (Google login = LA trip organizer; gets Apify-limit alerts via `OWNER_EMAIL`) |

---

## 2. Stack & architecture
- **Client:** React 18 + TypeScript + Vite + **Tailwind + Radix** (shadcn-style), in `client/`. Builds to `client/dist`, served by Express. **HashRouter** (`/#/t/:tripId/board`). Icons = **lucide-react**. Dark theme via CSS vars (`--bg --panel --panel-2 --border --text --muted --accent --warn --danger --link`) wired into Tailwind tokens.
- **Server:** `server.js` (Express) — all `/api` routes, per-trip JSON storage, auth, AI compare, search spawning, Apify-spend guard.
- **Scraper:** `pipeline.js` — Apify (VRBO + Airbnb). LA "Live Listings" run every 3 days (SQLite `pipeline.db`); per-trip search in `TRIP_ID` mode writes `data/trips/<id>/listings.json`.
- **Data:** `data/trips.json` (registry) · `data/trips/<id>/*.json` (per-trip) · global `users/sessions/magic/usage.json`. **The LA trip** (`la-birthday-2026`) reads the legacy flat files in `data/`.
- **Full spec:** see **`DESIGN_REFERENCE.md`** (every page, modal, flow, data model, API, + the component→file index) and **`docs/screenshots/`** (one image per page/modal).

---

## 3. Run / build / deploy (commands)
```bash
# dev (two terminals): backend + vite
node server.js                       # :3000 (serves client/dist in prod mode)
cd client && npm run dev             # :5173, proxies /api → :3000

# build the client
cd client && npm run build           # tsc --noEmit && vite build → client/dist

# deploy (from repo root) — builds the 3-stage Docker image on Railway
railway up --service exquisite-inspiration --detach
# verify live: curl the homepage for the new /assets/index-<hash>.js, or hit
#   /api/trips/la-birthday-2026/listings
```
Local screenshots: `node scripts/screenshots.cjs` (needs local server + a forged
session — see the script; it captures docs/screenshots/ then convert PNG→JPG).

---

## 4. Env vars (values live on Railway — never commit them)
`APIFY_TOKEN` (rotated when near limit), `GEMINI_API_KEY`, `RESEND_API_KEY`,
`MAIL_FROM`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `ADMIN_KEY` (platform super-admin
header), `OWNER_EMAIL=gold.nwobu@gmail.com`, `AIRBNB_LOCATIONS` (default `Los Angeles`,
1 query for cost), `TRIP_SEARCH_MAX` (default 10), `PIPELINE_INTERVAL_DAYS` (3),
`APIFY_ALERT_PCT` (0.85). Secrets are NOT in git.

---

## 5. State — what's DONE (all live on `main`)
- Full **vanilla → React/TS** rewrite; **multi-trip platform** (create trip, invite-by-link, trip switcher, dashboard, manage, delete-trip).
- **Form-driven search**: new trips auto-search their destination (capped ~10), ranked under-budget + cheapest first, min/max bedrooms, optional itinerary feeds it.
- **3 distance+time chips** (downtown / airport / attraction) on curated, pipeline, AND community submissions (Gemini-geocode fallback + one-time boot backfill). LA refs fixed; other trips geocoded via Gemini at search time.
- **AI compare** + **1v1 head-to-head VS** modal. **Detail modal** is deep-linkable (`?listing=<id>`, Back closes, Copy link) with a **map distance-toggle** (default downtown → airport/attraction re-centers the map).
- **Cost guard**: Apify spend checked before every scrape; at ≥85% it pauses + emails the site manager to rotate the key.
- **Icons**: lucide across the core interactive surfaces (Card, modals, dock, decision, shortlist). **Interim board density**: Submissions / Caveats / Live Listings collapse (persisted per trip).
- Ownership repair (LA trip linked to gold.nwobu), `.gitignore` hardened (no PII in git).

## 6. Known quirks / small TODOs (not blockers)
- Still emoji (deliberately deferred to redesign): the **🏡 brand logo** (needs a real mark), onboarding/help/landing explanatory copy, and the super-admin `AdminView` meter.
- Detail modal has a slight redundancy: a distance-chips summary near the title **and** the map toggle row — consolidate in redesign.
- A submission whose area is just "Los Angeles" geocodes to downtown (0 mi) — best guess from a generic area string.
- Free-tier Apify is tight (~$4–5/mo at 1 location every 3 days) → rotate keys when the alert email arrives, or go paid.
- Keyless Google **directions** embeds are dead → the map uses the reliable `q=` place embed (re-centers on the toggled reference; no drawn route line).

---

## 7. NEXT PHASE — the redesign (this is where we're headed)
Pipeline: **Claude Design** (lock the system → iterate screens against the real repo) →
**Claude Code** (implement tokens + `ui/` primitives in the actual `.tsx`) → push to
`main` → `railway up`. Personality decided: **warm but data-forward**, premium/clean,
**no AI-slop**. Screen order: landing → board → listing detail → auth/onboarding →
trips dashboard → manage → help → admin. Lock the design system BEFORE any page.

### 7a. Paste-ready "lock the design system" prompt for Claude Design
> **Where to point it:** connect Claude Design to the GitHub repo
> **`github.com/goldhac/grouppad` (branch `main`)**. Attach **`DESIGN_REFERENCE.md`**
> and the images in **`docs/screenshots/`**. Reference the live site:
> **https://exquisite-inspiration-production-7511.up.railway.app**. Set mode to
> **Design System**. If the repo is heavy to ingest, lead with DESIGN_REFERENCE.md +
> screenshots + the live URL (they fully describe the app).

```
Build a DESIGN SYSTEM for GroupPad — foundations + components only. Do NOT design
full pages yet. I'll approve the system first, then we do screens one at a time.

POINT YOURSELF AT: the connected repo github.com/goldhac/grouppad (branch main).
Read DESIGN_REFERENCE.md (full spec: pages, modals, flows, data models, and a
component→file index), the screenshots in docs/screenshots/, and the live site at
https://exquisite-inspiration-production-7511.up.railway.app as the starting point.

CONTEXT
GroupPad is a live product where a group of any size picks one vacation rental
together: browse rentals, vote, compare with AI, lock the official pick. It's an
existing React 18 + TypeScript + Vite app styled with Tailwind + Radix (shadcn-style
primitives). Icons are already lucide-react. Theme is dark, defined as CSS variables
(--bg, --panel, --panel-2, --border, --text, --muted, --accent, --warn, --danger,
--link) consumed through Tailwind tokens — so deliver the system as TOKENS that map
cleanly to that setup (Tailwind theme + those CSS variables).

PERSONALITY — premium, calm, data-forward
Think Linear / Vercel / Airbnb-quality, not a generic AI template. Friendly and
trip-appropriate, but per-person cost and distances are the real decision drivers,
so numbers stay crisp and legible. Restraint over decoration.

HARD "NO AI-SLOP" RULES (follow strictly):
- No rainbow/multi-stop gradients, no neon glow, no purple-to-pink hero blobs.
- No emoji as UI icons (we use lucide). One icon language, single stroke weight,
  sizes as tokens.
- No drop-shadow soup — one restrained elevation scale, used sparingly.
- Real typographic rhythm: a deliberate type scale, generous body line-height,
  tabular/mono figures for prices and distances so columns don't jitter.
- 4px spacing system, intentional whitespace, align to a grid; no random gaps.
- One accent color used with discipline (CTAs + active state only).
- Fast, tasteful micro-interactions (150–250ms ease-out); no bouncy motion.
- Accessibility: 4.5:1 text contrast, visible focus rings, 44px touch targets.

DELIVER
1. FOUNDATIONS as named tokens (implementable by editing Tailwind theme + the CSS
   variables above):
   - Color: refined neutral dark palette + ONE accent, plus SEMANTIC tokens for the
     product's real states — budget: under / marginal / over / unknown;
     official-pick; top-choice; caveat/dealbreaker; source tags
     (curated / community / live). AA-passing on-dark pairs. (Say if you'd also do a
     light mode; default is dark.)
   - Type scale (e.g. 12/13/14/16/20/24/32), weights, line-heights; tabular figures
     for prices/distances.
   - Spacing scale (4px base), radius scale, small elevation/shadow scale, motion
     tokens (durations + easing).
2. ICON SYSTEM: confirm lucide, define sizes (sm/md/lg) + stroke, and map the key
   product icons (distance pin/plane/ferris-wheel by kind; vote up/down; top-choice
   star; official-pick badge-check; compare swords/sparkles; nav home/help/chart;
   amenities pool/parking).
3. CORE COMPONENTS with every state (default/hover/active/focus/disabled, + loading):
   - Buttons: primary, secondary/ghost, danger.
   - The LISTING CARD — hero component, powers 4 grids: photo carousel, source badge,
     "est all-in" price with a smaller per-person figure beneath, beds·baths·sleeps,
     the 3 distance+time pills (downtown/airport/attraction), budget badge, rank
     badge, like (up/down), top-choice star, compare checkbox. Show under/marginal/
     over and the "official pick" variants.
   - Badges/chips: budget badge (4 states), rank badge, source tag, amenity chip,
     filter chip.
   - The split slider (per-person cost) + the filter bar.
   - Modal/dialog shell (Radix), toast, top navbar with trip switcher + account menu.
   - The floating compare dock and the head-to-head "VS" comparison layout.
   - A collapsible section header (chevron + title + count).

Keep it to foundations + components. After I approve, we redesign pages in this
order: landing → board → listing detail → auth/onboarding → trips dashboard →
manage → help → admin. Output ONE reviewable artifact with tokens named so it can
be implemented by editing Tailwind + the CSS variables, plus a short
"anti-patterns to avoid" list so it stays premium and consistent.
```

### 7b. After Claude Design returns the system
Hand it to **Claude Code** (this repo): "implement these design tokens by editing the
Tailwind theme + the CSS variables in `client/src/index.css`, and update the `ui/`
primitives + `Card.tsx` to match — keep all behavior/types intact." Then page by page.

---

## 8. How to resume cold in a new session
1. Open `/Users/goldnwbou/Documents/Flight_Search`. `git pull` on `main`.
2. Read this file + `DESIGN_REFERENCE.md` (+ skim `docs/screenshots/`).
3. State the goal (e.g. "implement the approved design system" or "redesign the
   landing page"). Build → `cd client && npm run build` → `railway up --service
   exquisite-inspiration --detach` → verify live.
```
