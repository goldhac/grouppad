# GroupPad — Site Map & Screen Inventory

> Single-page app. There is no multi-page routing — everything lives in `public/index.html`,
> styled by `public/style.css`, driven by `public/app.js`, served by `server.js`.
> "Screens" are hash-routed **views** that get toggled on/off, plus **overlays** (modals)
> that float above any view.
>
> Live: https://exquisite-inspiration-production-7511.up.railway.app
> Use this file to plan the page-by-page redesign.

---

## 1. The 4 routed views (hash routes)

`VIEW_IDS = { board, welcome, help, admin }` — only one is visible at a time.
Default when no hash: **signed-in → board**, **signed-out → welcome**.

| Route | View id | Who sees it | Purpose |
|-------|---------|-------------|---------|
| `#/welcome` | `welcome-view` | Signed-out (default landing) | Marketing/landing + sign-in entry + 3-step explainer |
| `#/board` | `board-view` | Everyone (the core app) | Browse, filter, vote, shortlist, compare, submit, decide |
| `#/help` | `help-view` | Everyone | "How it works" static explainer |
| `#/admin` | `admin-view` | Admin only (nav link hidden unless `ADMIN_KEY` set) | API usage dashboard + group pulse + pipeline controls |

---

## 2. Persistent chrome (renders on every view)

- **`<header>`** — H1 "GroupPad — LA Group Trip Rentals", `#trip-line` (dates/destination), `#params-line` (params).
- **`<nav class="topnav">`** — 🏠 Board · ❓ How it works · 📊 Admin (admin hidden until authed).
- **`<footer>`** — price-methodology fine print (TOT tax buffer, cleaning-fee notes, distance basis).

---

## 3. Screen-by-screen breakdown

### 3a. `#/welcome` — Landing (signed-out)
- **Hero**: headline "Pick the LA house for 14 — together.", `#welcome-trip` line.
- **CTAs**: `Sign in with Google` (primary) · `or use email` (ghost → opens auth modal).
- **Secondary links**: `Just browse the listings →` (to board), `▶ Take the 30-second tour` (replays onboarding).
- **3 numbered steps**: Browse & like → Shortlist & compare → Pick the winner.

### 3b. `#/board` — The core app (top → bottom DOM order)
1. **Filter bar** — checkboxes: Under-budget only · Pool · Parking · Include "check manually"; **Split slider** (2–30 people → live per-person cost); result `#count`.
2. **Submit bar** — `+ Add a listing` toggle → URL input + "Open with trip dates" link + price paste field + Submit.
3. **Itinerary section** — collapsible "View itinerary"; **admin-only editor** (textarea, PDF/text upload, Save, Clear) feeds the AI.
4. **Decision section** (`#decision-section`, hidden until set) — pinned ✅ official-pick banner.
5. **Shortlist section** (hidden until something qualifies) — homes with net-likes ≥1 + member-added:
   - `🤖 Compare with AI` → **compare panel**: free-text criteria, "Analyze & compare whole shortlist", result.
   - **1v1 / head-to-head** (`.h2h`): tick "compare" on cards → `⚔️ 1v1 (exactly 2)`, `Compare selected`, `Clear`.
   - **Group AI insights block** (public, cached server-side).
   - `#shortlist-grid` of cards.
6. **Community Submissions** (`#submitted-section`, hidden until any) — member-added homes not yet liked.
7. **Group caveats** (`#caveats-section`) — must-haves/dealbreakers chat; list + post box (feeds AI ranking).
8. **Main grid** (`#grid`) — all curated listings.
9. **Live Listings / pipeline** (`#pipeline-section`) — auto-scraped VRBO/Airbnb, "refreshed every 3 days".

### 3c. `#/help` — How it works
5 static cards: Like vs ⭐ Top choice vs ✅ Official pick · Browsing & details · Add a listing · AI compare & caveats · Signing in.

### 3d. `#/admin` — Admin dashboard
- **Head actions**: `↻ Refresh`, `⟳ Run pipeline`.
- **`#admin-dash`** cards: 🤖 Gemini (calls/tokens/est cost) · 🔥 Firecrawl (credits) · Apify (spend vs limit, recent runs) · group pulse. Auth is **header-only** (`x-admin-key`, stored in `localStorage.admin_key`).

---

## 4. Overlays / modals (float above any view)

| Overlay | id | Trigger | Notes |
|---------|----|---------|-------|
| **Sign-in modal** | `auth-modal` | any gated action / welcome CTAs | Google button + email magic-link form, inline validation. Replaced native popups. |
| **Onboarding tour** | `onboard-modal` | first visit (once via `localStorage.gp_onboarded`) or "Take the tour" | 5 slides, dots, Back/Next/Skip. |
| **Listing detail** | `detail-modal` | tap any card | Gallery, all amenities, price breakdown, per-person share, map. Closes on view change. |
| **Toast stack** | `toast-stack` | actions/errors | Non-blocking, auto-dismiss. Replaced `alert()`. |
| **Compare dock** | `compare-dock` | selecting cards to compare (board only) | Floating: count, ⚔️ 1v1, 🤖 Compare, Clear. |

---

## 5. The Card component (reused in 4 grids)

`renderCard(listing, isSubmitted, isPipeline)` powers shortlist, submitted, main, and pipeline grids.
Anatomy: photo carousel (`renderCarousel`) · title/source badge · price "est all-in" + per-person share
(`renderPerPerson`) · beds/baths/distance-to-DTLA · 👍/👎 like · ⭐ top-choice · "compare" checkbox · tap-to-open.

---

## 6. Auth / role states (drives what's visible)

| State | Can see | Can do |
|-------|---------|--------|
| **Signed-out** | welcome, board (read), help | browse only; any vote/submit/caveat → sign-in modal |
| **Signed-in member** | + voting, submitting, caveats, top-choice, AI compare | full participation |
| **Admin** (`x-admin-key`) | + `#/admin`, itinerary editor, ✅ decision, delete listings/caveats, run pipeline | organizer controls |

---

## 7. API surface (server.js → which screen)

- **Auth**: `GET /api/auth/me`, `POST /api/auth/request-link`, `GET /api/auth/verify`, `POST /api/auth/logout`, `GET /api/auth/google(+/callback)`, `POST /api/admin/logout-all`
- **Listings/board**: `GET /api/listings`, `GET /api/pipeline-listings`, `GET/POST /api/submitted`+`/api/submit`, `DELETE /api/listings/:id`, `DELETE /api/submitted/:id`
- **Voting**: `GET/POST /api/votes`, `GET /api/final`, `POST /api/final-vote`, `POST /api/admin/decision`
- **AI / content**: `POST /api/compare-listings`, `GET /api/insights`, `GET /api/itinerary`, `POST /api/admin/itinerary`, `GET/POST /api/caveats`, `DELETE /api/caveats/:id`
- **Admin**: `GET /api/admin/verify`, `POST /api/admin/run-pipeline`, `GET /api/admin/apify-usage`, `GET /api/admin/usage`

---

## 8. Client state (localStorage)

- `admin_key` — admin auth (sent as `x-admin-key`).
- `gp_onboarded` — suppresses the onboarding tour after first run.
- `gp_session` cookie — server session (Google OAuth or magic-link).

---

## 9. Known issues to address in the redesign (from testing pass)

1. Signed-out users can see admin-style controls in places — tighten role gating.
2. Stale header CTA / nav state across views.
3. Garbled itinerary rendering in some cases.
4. Mobile reflow unverified on real devices (headless capture limitation).
5. Lots of emoji used as structural icons — skill flags this; swap to an SVG icon set.
6. Detail modal was staying open on navigation — fixed (`closeDetail()` in `showView`), keep verifying.

---

### Redesign planning order (suggested)
`welcome` (first impression) → `board` (the product) → `detail modal` (the decision moment) →
`auth + onboarding` (conversion) → `help` → `admin`. Run each through the `ui-ux-pro-max`
skill's `--design-system` first to lock one consistent system, then page overrides.
