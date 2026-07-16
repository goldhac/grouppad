# GroupPad — Product Requirements Document

**Status:** Living document · **Last updated:** 2026-07-10 · **Owner:** Gold Nwobu
**Product:** GroupPad — *Plan a group trip your whole group actually agrees on.*
**Live:** https://exquisite-inspiration-production-7511.up.railway.app

---

## 1. Executive summary

GroupPad is a web app (installable PWA) that helps a group of friends or family
decide on **one vacation rental together**, without the 200-message group chat and
the 14 lost Airbnb links. One person starts a trip, shares a link, and everyone
lands on a single shared board where the candidate homes — and the decision — live.

The product collapses three painful, scattered activities into one place:
1. **Collecting** candidate homes (auto-discovered + pasted links),
2. **Comparing** them on the terms that actually matter to a group (real
   **per-person** cost, who likes what, an AI tie-breaker), and
3. **Deciding** — everyone casts one top choice and the organizer locks an
   official pick.

The core insight: group lodging decisions stall not from lack of options but from
**lack of a shared, transparent surface** to weigh them. GroupPad is that surface.

---

## 2. Problem statement

Planning a group stay today is a mess of parallel, lossy channels:

- **Link chaos.** Everyone pastes Airbnb/VRBO links into a group chat; they scroll
  away and are lost within hours.
- **No per-person truth.** A "$5,000 total" means nothing until someone does the
  math for 14 people, re-does it when two more join, and argues about cleaning fees.
- **Invisible preferences.** Nobody knows who actually likes which home; "I'm
  easy" × 12 people = permanent deadlock.
- **No decision mechanism.** There's no moment where the group *commits*. Threads
  die; someone eventually books in frustration.

**Result:** trips get delayed, downgraded, or booked by one exhausted person who
then absorbs the blame.

---

## 3. Goals & non-goals

### Goals
- G1 — Give a group **one shared board** for all candidate homes.
- G2 — Show the **real, live per-person cost** of every home, recomputed as the
  group size changes.
- G3 — Make group preference **visible and lightweight** (open voting, a
  self-forming shortlist).
- G4 — Provide an **AI tie-breaker** ("Scout") that ranks homes to the group's
  itinerary/budget and explains *why*.
- G5 — Provide a crisp **decision ritual** (everyone stars one top choice →
  organizer locks an official pick).
- G6 — Zero-friction onboarding: browse as a guest, one-tap passwordless sign-in
  to participate.
- G7 — Keep unit economics near-zero (self-hosted discovery, pay-per-use AI).

### Non-goals
- NG1 — GroupPad does **not** handle booking or payment. It ends at "the group
  agreed; go book it." (Prices are estimates; members verify at checkout.)
- NG2 — Not a general OTA / search engine. It's a *decision* tool scoped to a
  group's shortlist for one trip.
- NG3 — Not a chat app. Discussion is intentionally lightweight (per-home caveats),
  not a replacement for the group's existing chat.
- NG4 — No personalized financial/travel advice.

---

## 4. Target users & personas

| Persona | Who | Needs |
|---|---|---|
| **The Organizer** | The person who starts the trip (often the "planner friend"). | Kick off a search, invite everyone, keep momentum, and *close* the decision without being the villain. |
| **The Members** | 5–20 friends/family joining the trip. | Skim options fast, see what *they'd* pay, register a preference in 2 taps, trust the outcome. |
| **The Group** | The collective. | A fair, transparent process that produces one agreed home. |
| **Platform admin** | GroupPad operator (super-admin). | Monitor spend (AI, scraping), generate demos, manage the platform. |

**Primary scenario:** 8–16 adults, one rental, a fixed date range, a shared budget,
planning 1–9 months out.

---

## 5. Jobs-to-be-done / user stories

- As an **organizer**, I want to start a trip with destination/dates/guests/budget
  so the group immediately has candidate homes to react to.
- As an organizer, I want to **share one link** so people join without accounts.
- As a **member**, I want to **browse as a guest** and only sign in when I act.
- As a member, I want to see **exactly what I'd pay** for each home so the
  conversation is concrete.
- As a member, I want to **thumbs-up homes I like** and have favorites *rise* into
  a shortlist automatically.
- As a member, I want to **paste a link** I found and have it priced + added.
- As anyone, I want to **ask Scout** to rank the board or compare two homes and
  tell me why.
- As the group, I want to **each pick one top choice** and see a live leaderboard.
- As the organizer, I want to **lock the official pick** when the group has spoken.
- As a member, I want an **email when someone new joins** and when the pick is
  locked, so I stay in the loop without living in the app.

---

## 6. Functional requirements (features)

### 6.1 Trips
- **Create a trip:** destination, check-in/out dates, guest count, budget, optional
  home type. Creating a trip **kicks off a rentals search** for those parameters.
- **Trip roster ("who's coming"):** transparent list of members with names/avatars/
  roles. Emails are organizer-only.
- **Two trip classes (implementation detail):**
  - The **flagship LA trip** (`la-birthday-2026`) — a curated demo/default trip
    powered by a scheduled multi-source pipeline writing to `pipeline.db`.
  - **User-created trips** — each runs an on-demand per-trip search into its own
    `data/trips/<id>/` folder.
- **Manual refresh:** the organizer gets one manual "refresh listings" per interval
  window (listings also auto-refresh on a schedule).

### 6.2 The shared board
The single screen where the trip lives. Sections:
- **Recommended** — AI-ranked (Scout) best-to-worst for the group's itinerary, each
  card showing a one-line "why it ranks here."
- **Shortlist** — homes the group has liked (self-forming; a home crosses net +1 → it
  rises in with a small animation).
- **Saved** — the viewer's personal bookmarks.
- **Decision** — the top-choice leaderboard + official pick.
- **Discussion** — lightweight per-home caveats/must-haves.
- **From your group / Community** — homes members pasted in.
- **Quick-filter chips:** Under budget · Pool · Parking · Hot tub, plus the guest
  stepper (splits the price live).

Each **home card** shows: photos (swipeable carousel + lightbox), title, source,
area, beds/baths/sleeps, rating + reviews, **all-in 5-night total**, **per-person
cost**, budget tier badge, a **"New" badge** on freshly-pulled homes, vote controls,
save/top-choice, and a compare checkbox.

### 6.3 Listings discovery (the pipeline)
Two distinct jobs, treated separately:
- **Discovery / search** → returns the candidate set for a location.
  - **Airbnb: self-hosted.** GroupPad drives its own headless Chromium against
    Airbnb's public search, reads the embedded results JSON, and paginates — **no
    third-party API, no per-result fee.** Works from any IP (Airbnb search isn't
    IP-walled). Used by **both** the LA pipeline and every per-trip search, via one
    shared `airbnbSelfHostSearch()` engine. The paid Apify actor remains only as an
    automatic fallback if self-host returns nothing.
  - **VRBO: Apify actor** (LA trip only). VRBO/Expedia is protected by PerimeterX,
    which walls datacenter IPs (Railway). A managed actor rents the residential
    proxies + fingerprints that survive the wall. (Self-hosting VRBO is possible
    only from a residential IP or via residential proxies — see §14.)
- **Per-listing price / detail** → the exact/representative price for candidates.
  Airbnb self-host returns a representative 5-night total inline; a Playwright pass
  can re-price at exact dates (skippable via fast mode). VRBO price comes from the
  actor. Optional **Firecrawl** enrichment adds structured detail on survivors.

### 6.4 Per-person pricing
- Every home shows the **all-in 5-night total** and **what each person pays**,
  recomputed live from the guest stepper.
- All-in is an **estimate** by design: base price + a cleaning placeholder (VRBO) +
  tax. (Airbnb totals already include cleaning; only tax is added.) True checkout
  fees live behind each site's reservation flow; members verify at booking.
- Budget tiers: **under / marginal / over / unknown**, surfaced as a badge and used
  by the recommendation ranker.

### 6.5 Voting & shortlist
- **Open thumbs-up/down** on any home. Voting is **fully transparent**: members can
  see **who's coming**, **who voted** for what, and **who picked** each home.
- Any home that crosses **net +1** rises into the **Shortlist** automatically with a
  brief "rose" animation.
- Guests can browse; a vote prompts one-tap sign-in.

### 6.6 Scout (the AI guide)
- **Rank the board:** reads the trip's itinerary, budget, and must-haves, then ranks
  homes best-to-worst with a one-line reason each (structured, not "AI slop").
- **Compare:** pick 2+ finalists → a side-by-side verdict.
- **AI video walkthrough:** generate a short image-to-video tour of a home's best
  spaces (fal.ai). Super-admin can generate on any listing and bypass the cap.
- Powered by Google **Gemini** (ranking/compare/photo selection) + **fal.ai**
  (image-to-video).

### 6.7 Paste-a-link (community submissions)
- Drop an Airbnb/VRBO/Booking/villa link → it's scraped, priced all-in, **deduped**
  against the same home from other sources, and added as a "community" home for the
  group to weigh in on. Attributed to the submitter.

### 6.8 Decision / official pick
- Everyone casts **one top choice** (a star on a card).
- A **leaderboard** shows where the group stands (and who picked what — transparent).
- The organizer **locks the official pick** with a gold-seal ("Make official"),
  gated until the group has cast top choices. Locking emails all members.

### 6.9 Themes
- Six brand **skins** (Classic, Tropical, Coastal, Sunset, Pink Summer, Forest),
  each composing with light/dark mode.
- The **organizer sets a trip default**; each **member can override** it personally.
- Surfaced in onboarding + the guided tour. Never applied to public/marketing pages
  (landing stays consistent).

### 6.10 Invites & notifications
- Share-link invites with a celebratory **welcome sheet** (real generated hero
  image) that flows into the site walkthrough.
- **Email on join** (someone new joins the trip), **email on refresh** ("fresh homes
  pulled" — gated on a real inventory-change signature to avoid false blasts), and
  **email on lock** (official pick).
- Passwordless **magic-link** email sign-in (optional Google OAuth). Daily member
  digest of activity (opt-out/unsubscribe respected).

### 6.11 Onboarding & guided tour
- First-run onboarding slideshow + a **site walkthrough** that points out the board,
  per-person price, voting, Scout, themes, and the official-pick lock (web + mobile).

### 6.12 Member management
- Remove/leave a member → their **likes and top pick are purged** (their submitted
  listings stay). Comment purge is an open decision (see §12).

### 6.13 Platform admin
- Super-admin (via `SUPER_ADMIN_EMAILS`) sees a **spend dashboard**: live meters for
  Gemini (token→USD est, monthly cap), Apify (live $), Firecrawl (credits), and
  fal.ai (clips × seconds × rate). Admin-key endpoints to trigger/rotate refreshes.

---

## 7. Non-functional requirements

- **Performance:** board first paint < ~2s on the LA trip; discovery self-host run
  ~30–60s/location; fast refresh (skip re-pricing) reaches board update in ~2 min.
- **Availability:** if a refresh yields 0 homes, the **previous board is kept** (never
  blanked). A bundled seed snapshot backs an empty/cold DB.
- **Security:** membership gate + join code on trips; XFF-aware per-IP rate limits on
  money-costing endpoints; prototype-pollution & SSRF-redirect guards; magic links
  built from `APP_BASE_URL` (never the request host) to prevent host-injection.
- **Privacy / transparency:** the group is transparent by design (names, votes,
  picks visible to members) — but **emails are organizer-only**, and member removal
  purges personal activity.
- **Cost control:** self-hosted Airbnb discovery ($0), pay-per-use AI with metered
  spend + monthly caps and owner alerts when a provider nears its limit; stacked
  Apify keys with auto-rotation.
- **Resilience:** every external dependency degrades gracefully (missing AI/scraping
  keys disable that feature rather than break the app).
- **Accessibility & mobile:** installable PWA; mobile-first board, carousels, and
  lightbox; reduced-motion respected.

---

## 8. System architecture

```
client/            React 18 + TS + Vite, HashRouter, Tailwind + ds2 tokens (PWA)
  src/views/         screen components (Board, Trips, Manage, Admin, mobile *)
  src/store/         AppContext — all client state + the API layer
  src/ds2/           design tokens, themes (skins), component CSS
server.js          Node 20 + Express — single API server + static host + AI/orchestration
pipeline.js        rentals discovery/pricing runner (LA main() + per-trip runTripSearch)
data/              per-trip JSON (listings, votes, finalvotes, members, submissions…)
                   + pipeline.db (SQLite) for the LA scraped board
docs/              PRD.md · BACKLOG.md · INFRA_PLAN.md
Dockerfile         multi-stage build → lean runtime with bundled Chromium
```

- **Client:** React + Vite SPA, HashRouter, CSS-token design system (`ds2`),
  installable PWA (manifest + service worker). All state + API in `AppContext`.
- **Server:** a single Express process (`server.js`) serves the built client and the
  API, and orchestrates AI + spawns the discovery pipeline.
- **Storage:** file-based JSON under `PIPELINE_DATA_DIR` (a persistent volume in
  prod) — no external DB. The LA scraped board uses a local **SQLite** `pipeline.db`.
- **AI & data services:** Google **Gemini** (ranking/compare/photo), **fal.ai**
  (walkthrough video), self-host **Playwright/Chromium** (Airbnb discovery + pricing)
  with **Apify** (VRBO) and **Firecrawl** (enrichment) as managed helpers, **Resend**
  (email).
- **Hosting:** Docker on **Railway** (multi-stage build; Chromium bundled for the
  self-host scraper). Two environments: **production** and **staging** (isolated
  domain + data).

---

## 9. Data model (essentials)

Per-trip JSON (and the LA `pipeline.db` listings table) capture:

- **trips** — id, name, destination, dates (checkin/checkout_5n/4n), adults, budget,
  tax_rate, owner_id, members[], join_code, skin, refreshed_at, last_manual_refresh.
- **listings** — source, id, name, url, area, bd/ba/sleeps, pool/parking/hot_tub,
  rating/reviews, photos[], amenities[], distances[], displayed_5n/est_5n, budget
  tier, **is_new**, first_seen/last_seen, passed_filter.
- **price_snapshots** — (source, listing_id, run_date) → price_total, nights.
- **votes** — per listing per user (up/down).
- **finalvotes** — each user's single top choice; **decision** — the locked pick.
- **submitted** — community (member-pasted) listings.
- **members / users / sessions / magic** — identity + passwordless auth.
- **events / insights / itinerary / caveats / reviews / tours** — activity, AI
  outputs, per-home discussion, walkthrough clips.
- **usage** — provider spend meters (Gemini/Apify/Firecrawl/fal).

---

## 10. The discovery & pricing pipeline (detail)

**LA pipeline (`main()`):** scheduled every few days.
1. **Discover** — Airbnb (self-host) + VRBO (Apify), for the LA locations.
2. **Dedupe** — SQLite upsert on (source, listing_id); cross-source dedup of the same
   home; stamp **is_new** on this run's fresh inserts.
3. **Pre-filter** — bedrooms ≥ floor (default 6).
4. **Price** — Playwright re-prices Airbnb candidates at trip dates (skippable in
   *fast* mode; VRBO is never Playwright-priced — it's walled on datacenter and the
   actor already prices it).
5. **Budget filter** — drop est. all-in > budget; keep the previous board if a run
   yields 0.
6. **Enrich** — optional Firecrawl structured detail on survivors.

**Per-trip pipeline (`runTripSearch`):** on-demand when a user creates/refreshes a
trip. Self-host Airbnb search (dated within a ~9-month horizon, else undated),
maps to the trip's budget/refs, ranks under-budget-then-cheapest, writes the top-N to
`data/trips/<id>/listings.json`, stamps **is_new** vs the previous board. Apify actor
is the fallback if self-host returns nothing. **No VRBO** on per-trip (LA only).

---

## 11. Key user flows

**Organizer:** Start trip → search kicks off → share link → homes fill in → nudge
votes → everyone stars a top choice → **lock official pick** → members emailed.

**Member (invited):** Open link → celebratory welcome → land on board as guest →
browse + see per-person cost → one-tap sign-in to vote → thumbs-up favorites → ask
Scout / compare → star a top choice.

**Decision:** Votes build a shortlist → each member casts one top choice → leaderboard
shows the leader → organizer locks the gold-seal official pick → done.

---

## 12. Roadmap / open items (see `docs/BACKLOG.md`)

- **GP-1 — Mobile gap audit** vs the design handoff (board first, then remaining
  screens). *Medium.*
- **GP-2 — GitHub auto-deploy** (Railway source connect: staging→`redesign-v2`,
  prod→`main`). *Medium.*
- **GP-3 — Member-removal comment purge** — decide whether removing a member also
  drops their discussion caveats. *Low.*
- **VRBO on all trips** — currently LA-only; would spread the Apify dependency (and
  the wall/cost tradeoffs) to every trip. *Deliberate deferral.*
- **Apify plan** — free-tier ($5/mo) exhausts under repeated VRBO refreshes; a paid
  plan (or more stacked keys) is needed for reliable VRBO. *Decision.*

---

## 13. Success metrics

- **Activation:** % of created trips that get ≥1 additional member joined.
- **Engagement:** % of members who cast ≥1 vote; median votes/home.
- **Decision rate:** % of trips that reach a **locked official pick** (north-star).
- **Time-to-decision:** days from trip creation → official pick.
- **Discovery health:** homes/board, % priced, self-host block rate.
- **Unit cost:** AI + scraping $ per active trip (target: near-zero discovery).

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Airbnb changes its page shape** → self-host parser breaks | Auto-fallback to the Apify actor if self-host returns 0; parser is centralized in one function. |
| **VRBO/Expedia bot wall** blocks datacenter IPs | Keep VRBO on a managed actor (rents residential proxies). Self-host VRBO only viable via residential proxies (cost) — deferred. |
| **Apify free-tier exhaustion** → VRBO empties | Stacked keys with `apifyGuard` auto-rotation; owner alerted near limit; path to paid plan. Airbnb is unaffected ($0 self-host). |
| **Prices are estimates**, not checkout totals | Explicitly labeled; members verify at booking; consistent (base + fees + tax) formula in one place. |
| **AI cost creep** (Gemini/fal) | Metered spend, monthly caps, admin dashboard, walkthrough clip caps. |
| **Empty board after a bad run** | Keep previous board on 0-result runs; bundled seed snapshot fallback. |
| **Host-injection via magic links** | Links built from `APP_BASE_URL`, never the request host. |

---

## 15. Appendix

### Environment variables (selected)
`PORT` · `PIPELINE_DATA_DIR` · `APP_BASE_URL` · `SUPER_ADMIN_EMAILS` · `ADMIN_KEY` ·
`GEMINI_API_KEY`/`GEMINI_MODEL` · `FAL_KEY`/`FAL_MODEL` · `APIFY_TOKEN`(+`_FALLBACK`/
`APIFY_TOKENS`) · `FIRECRAWL_API_KEY` · `RESEND_API_KEY`/`MAIL_FROM` ·
`GOOGLE_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI` · `AIRBNB_DISCOVERY`(selfhost|apify) ·
`MIN_BEDROOMS` · `VRBO_ADULTS` · `VRBO_MAX_RESULTS` · `SKIP_PRICE_FETCH` ·
`PIPELINE_INTERVAL_DAYS` · `PRICE_TTL_DAYS`.

### Glossary
- **Scout** — the in-product AI guide (rank / compare / walkthrough).
- **Self-host discovery** — driving our own headless Chromium instead of a paid
  scraping API.
- **Per-person cost** — all-in total ÷ current group size.
- **Official pick** — the organizer-locked winning home (gold seal).
- **is_new** — the "New" badge flag on homes brought in by the latest refresh.

---

*Built with Claude Code. This PRD reflects the shipped product as of the date above
and supersedes ad-hoc feature notes.*
