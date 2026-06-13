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

## Done (recent)
- Themes system (6 skins) — organizer default + personal override, web + mobile,
  onboarding + guided tour; never themes public/landing pages. **Shipped.**
- Transparent top-pick, invite welcome + site tour, who's-coming/who-liked,
  admin spend meter, staging environment, slim-upload deploy fix. **Shipped.**
- Member removal purges likes + top picks (keeps listings). **Shipped.**
