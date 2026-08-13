# GroupPad — Backlog (open tickets)

Lightweight tracker until a real Jira/board is set up. Each item is written
ticket-style so it can be pasted into Jira later. Status: TODO / DOING / DONE.

> Idea on file: set up **Jira** (or Linear) for these projects to track open
> tickets properly. Until then, this doc is the source of truth.

---

## GP-1 · Mobile gap audit vs the design handoff — TODO
**Type:** Polish / design-reconciliation · **Priority:** Medium (post-launch)
Compare the 6 live mobile screens against `Groupad (1).zip` (`design_handoff_mobile/`)
mockups, screen by screen, then fix the gaps. Not a blocker — app is launched.

**Findings so far (Board screen, 1 of ~5):**
- **Group-pulse ring is square** in the build; mockup uses a clean **circular**
  progress donut ("% voted"). → make it circular.
- **Cards are busier than spec.** Mockup is deliberately spare: photo + a single
  **bookmark** top-right, details on tap. Build overlays **3 icons** (star,
  compare, bookmark) on the photo. → trim to match.
- **Missing inline quick-filter chips.** Mockup shows *Under budget / Pool /
  Parking* chips beside "Filters"; build shows only Filters + the guest stepper.

**Still to audit:** Landing, Trips dashboard + Create, Manage + Help, Admin + Legal.
**Suggested order:** fix Board gaps first (90% of usage), then audit the rest.
Mockups: `/design_handoff_mobile/screenshots/*.png`. Authoritative values in the
bundle's `ds2/*.css`.

---

## GP-2 · Connect GitHub auto-deploy — TODO
**Type:** Infra · **Priority:** Medium
Connect the repo in Railway (Service → Settings → Source → `goldhac/grouppad`):
staging → `redesign-v2`, production → `main`, auto-deploy on push. Removes the
manual `railway up` step and enables clean push→staging→prod promotion.
(`railway up` works reliably now after the slim-upload fix, so this is a nicety.)

---

## GP-3 · Member removal — also purge comments? — QUESTION
**Type:** Product decision · **Priority:** Low
Shipped: removing/leaving a member purges their **likes + top pick** (listings
stay). Open question: should their **Discussion comments (caveats)** also be
removed? Currently they remain. Decide and, if yes, extend
`purgeNonMemberActivity` to drop their caveats too.

---

## GP-4 · PostHog-driven Tier-2 review (autonomous) — PARKED
**Type:** Analytics / planning · **Priority:** Low (revisit ~2026-08-18)
PostHog analytics + error tracking are LIVE (US project 548004). Plan was a 7-day
autonomous cloud routine that queries the funnel via a PostHog personal API key and
re-ranks Tier 2 in `docs/AUDIT.md`. **Parked:** creating the personal API key needs a
PostHog security re-auth only the user can complete. Resume: user re-auths → create a
read-only key → embed in a one-time cloud routine (run_once_at ~2026-08-18). Until then,
data is still accumulating; do the Tier-2 review manually with the user when they're active.

---

## GP-5 · "Experiences" — things to do near the chosen rental — DESIGN
**Type:** Product / feature · **Priority:** High (next big feature)
GroupPad's take on Airbnb Experiences: once a group is looking at / has picked a rental,
surface things to do nearby — browsable during selection, votable like homes, feedable into
Scout's AI decision, and roll-up-able into a generated day-list/itinerary. Data via a FREE
self-hosted Airbnb Experiences scraper (same self-host approach as homes; built in `experiences.js`).
Feature list drafted 2026-08-11 (see chat). Scraper build in progress. Decide scope, then build.

---

## Done (recent)
- Themes system (6 skins) — organizer default + personal override, web + mobile,
  onboarding + guided tour; never themes public/landing pages. **Shipped.**
- Transparent top-pick, invite welcome + site tour, who's-coming/who-liked,
  admin spend meter, staging environment, slim-upload deploy fix. **Shipped.**
- Member removal purges likes + top picks (keeps listings). **Shipped.**
