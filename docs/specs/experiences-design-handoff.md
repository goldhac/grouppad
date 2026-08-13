# Experiences ("Things to do") — Design handoff packet

**For:** Claude Design · **Status:** documenting shipped code, 2026-08-12
**Source of truth for behaviour:** `docs/specs/experiences.md` (full spec + phase history) ·
`docs/specs/scout.md` (AI demarcation)
**Nothing in this file proposes new features.** It describes exactly what exists, where it
lives, and what is weak about it.

---

## 1 · What the feature is

GroupPad's wedge is *"the group can't agree."* Homes proved the loop — **discover → vote →
decide** — and Experiences extends the same loop to *things to do* on the trip. We scrape
Airbnb Experiences for the trip's destination and dates, the group thumbs them up or down, a
live leaderboard shows what's actually winning, and Scout (our AI persona) can turn the
up-voted set into a day-by-day plan that a human chooses to save into the trip's itinerary.
There is a personal lane too: save what you like privately, have Scout plan just yours, and
drop a share link in the group chat. **GroupPad never books anything** — no payments, no
availability, no cut. Every path out ends at "Open on Airbnb."

Two anchor moments: *while choosing a home* ("this area has great stuff to do") and *after
the pick is locked* ("here's what's near your place" — distances re-anchor on the chosen home).

---

## 2 · Screens & surfaces

### 2.0 Where each surface lives

| Surface | File | Entry point |
|---|---|---|
| Desktop "To do" tab | `client/src/components/board/ExperiencesSection.tsx` → `ExperiencesSection()` | `client/src/views/BoardView.tsx` L333 (`tab === 'todo'`) |
| Mobile "To do" view | `client/src/views/MobileBoard.tsx` L407–527 (`todoView`) | bottom-nav slot 4 |
| Experience card (desktop) | `ExperiencesSection.tsx` → `ExperienceCard` (L39) | inside `.b-grid` |
| Experience card (mobile) | inline `<article className="mcard">` in `todoView` | inside `.list` |
| Detail dialog (both shells) | `ExperiencesSection.tsx` → `ExperienceModal` (L119, exported) | card / leaderboard row / plan row tap |
| Public share page | `server.js` L286–357 | `GET /s/plan/:tripId/:userId` |
| PDF variant | `server.js` L250–284 | `GET /s/plan/:tripId/:userId.pdf` |
| Leaderboard CSS | `client/src/ds2/board.css` L509–533 (`.xlb-*`) | — |
| Plan-panel CSS | `board.css` L535–553 (`.xplan-*`, `.tab-panel .ai-card`) | — |
| Dialog CSS | `client/src/ds2/detail.css` L218–253 (`.xd-*`, `.dx.xd2`) | — |

### 2.1 Desktop "To do" board tab

Rendered inside `.tab-panel.gp-panel` (BoardView L283). Vertical order:

1. **`.row-head`** — title "Things to do", `.cnt` pill (visible count), `.sub`
   ("near {destination} · vote for what you'd actually do — booking happens on Airbnb"),
   and `.rh-right` holding two `btn btn-ghost btn-sm` buttons: **Nearest** (only when a
   distance anchor exists) and **Refresh**.
2. **Leaderboard** — `.xlb` (§2.5).
3. **Scout's plan panel** — `.tab-panel .ai-card` (§2.6), only when a plan exists.
4. **My plan panel** — `.tab-panel .ai-card` (§2.7), only when signed in *and* you have
   saves / picks / a plan.
5. **Vibe chip row** — an inline-styled flex-wrap row of `.chip-filter` buttons
   (`All {n}` · optional `Saved {n}` · up to 6 vibes with live counts). Only rendered when
   ≥2 vibes match ≥2 items each.
6. **Card grid** — `.b-grid` (4 cols → 3 → 2 → 1 at the board container breakpoints,
   `board.css` L224/305/308/328), staggered entrance from `motion.css` L32–40.
7. **Dialog** — portal, on top of everything (§2.4).

**States**

| State | What renders |
|---|---|
| Loading / pending scrape | `experiences.length === 0 && expPending` → centred `Compass` icon + "Finding things to do near {destination}… check back in a minute." *(whole tab replaced; leaderboard/chips/grid are not shown)* |
| Empty (scrape returned nothing) | same shell, "No things to do found for this trip yet." + `btn btn-primary btn-sm` **"Look for things to do"** |
| Populated | full stack above |
| Filtered to nothing | `sorted.length === 0 && vibe` → muted line "Nothing in that vibe yet." + ghost **Show all** button, grid empty |
| Error | **No error state exists.** All fetches are `.catch(() => {})`; failures surface only as toasts on write actions. A failed load is indistinguishable from "empty". |

### 2.2 Mobile "To do" view (≤520px shell)

`useIsMobile()` (`client/src/lib/useIsMobile.ts`, breakpoint 520) swaps `BoardView` for
`MobileBoard` wholesale. Everything is scoped under `.gp-mobile` in
`client/src/ds2/mobile-app.css`.

Structure inside `.mb-scroll`:

- `.sec` → `.sec-h` (`.t` "Things to do" + `.c` count + optional **Nearest** `btn btn-sm`)
  → `.sec-sub` (same booking-happens-on-Airbnb line).
- `.fchips` horizontal scroller of `.fchip` vibe chips (mobile idiom, not `.chip-filter`).
- `.xlb` leaderboard — same block as desktop, but **no `.xlb-meta`** rendered in the markup,
  **no "you liked" annotation**, and **no `.xlb-actions` row** (so no Scout button on mobile).
  `@media (max-width:560px)` also hides `.xlb-meta` and shrinks `.xlb-thumb` to 34px.
- `.list` of `.mcard`: `.ph` (photo via `MobilePhotoCarousel`) → `.info` with `.row1`
  (`.nm` title, `.rt` rating), `.sub` (category · duration · distance, joined by `·`),
  `.pr` (`<ExpPrice>`), then an inline-styled action row of two `btn btn-sm` vote buttons,
  a net count, and an icon-only "Open on Airbnb" link.
- Empty/pending: `.empty` block with `.ec` icon, `<h3>` + `<p>` + refresh button.

**Parity gaps vs desktop (real, not a bug list — a design decision to make):** mobile has
**no save button, no select-for-Scout, no Saved lens, no Scout's-plan panel, no My-plan panel,
no share, no PDF, no day pinning outside the dialog.** The entire personal lane is
desktop-only today. The card also uses a different vote control (two `btn`s, not `.votebar`)
and shows no badges at all — the desktop card's five badges collapse into one `·`-joined
`.sub` line.

**Mobile chrome that frames it**

- **Top bar `.tbar`**: back chevron + full trip name (`.nm .t` / `.s` = dates · guests),
  `WhosComing compact`, owner `Host` pill, then a single `⋯` `.iconbtn` opening the
  **More sheet**. Deliberately reduced from 4–6 icons because the trip name was truncating.
- **More sheet** (`.sheet.show` + `.scrim.show`, `.grab` handle, `.sh-head`): Chat (pip),
  Saved (pip), theme toggle, owner-only Refresh listings + Manage trip, "Show me around".
- **Bottom nav `.mb-nav`** — five slots: `Homes · Shortlist · [+] Add (FAB) · To do · Decision`.
  "To do" uses the `Compass` icon and carries **no pip**. Chat and Saved were demoted to the
  More sheet to keep this row at five.

### 2.3 The experience card (desktop)

`<article className="card">` (+ `is-selected` when picked). Uses the shared homes-card
primitive, so all of `boardx.css` / `components.css` `.card *` rules apply.

| Zone | Markup | Notes |
|---|---|---|
| Photo | `<Carousel>` with a single photo | one image only — the carousel arrows/dots are effectively dead weight here |
| Overlay top-right | `.save-btn` (Bookmark, `right: 52px`) and `.star-btn` (Check, `right: 10px`) | both 34px circles, `--surface-overlay` + `backdrop-filter: blur(6px)`. **Do not re-position** — an override once stacked them at 52px and made one unclickable (`board.css` L555–557) |
| `.badge-row` | up to **5** `.badge`s in order: `Save $X` (`.badge-under`), pinned day (`.badge-under` + CalendarDays), `Group rate` (UsersRound), category, `★ rating (count)` | `.card .badge-row` is `justify-content: space-between` with **no `flex-wrap`** — five badges in a 4-col grid cell is the single most crowded thing on this surface |
| `.title` | `<h3>`, display font 16.5px | |
| `.specs` (1) | `<ExpPrice>` — `From $X / guest\|group`, optional `<s>` strikethrough original, optional `~$Y pp` at the trip split · `·` · `⏱ duration` | |
| `.specs` (2) | `📍 {n} mi from {anchorLabel}` | only when a decision is locked and an anchor resolves |
| `.votebar-row` | `.votebar` (`.vote.up` / `.net` / `.vote.down`, pill, `patterns.css` L9–24) + `btn btn-ghost btn-sm` **"Open on Airbnb"** with `ExternalLink` | click is `stopPropagation`'d so voting doesn't open the dialog |

Whole card is `role="button"` → opens the dialog; Enter/Space handled.

**States:** default · `is-selected` (picked for Scout — currently only a `.star-btn.on` colour
change; `.card.is-selected { outline: none }` and the `.card-bare` ring rule does not apply to
this card, so **selection is nearly invisible**) · saved (`.save-btn.on`, accent fill) ·
voted (`.vote.up.on` / `.vote.down.on`, `--up-bg` / `--down-bg`).

### 2.4 The experience detail dialog

Portal-rendered via Radix (`DialogPrimitive.Root/Portal/Overlay/Content`).

```
.dx-scrim              (fixed, --scrim)
.dx-modalwrap          (fixed, scrollable, flex centre)
  .dx-modal            (max-width 1060px, --r-xl, --shadow-pop, dx-pop entrance)
    .dx-shell          (container-type: inline-size, container-name: dx)
      .dx.xd2          (grid: 1fr 1fr — landscape on laptops)
        .dx-gallery > .dx-lead   (4/3 photo, .gbadges = Save $X + category)
        .dx-info
          .dx-topbar   (Group rate badge, ★ rating badge, .spacer, .iconbtn close)
          h2.dx-title
          .xd-facts    ($price/unit, was-price, ~pp, ⏱ duration, 📍 distance)
          .xd-days     (.xd-rev-h "Which day?" / "Planned for" + .xd-daychips of .chip-filter)
          .xd-rev      (.xd-rev-h aggregate line + up to 4 blockquote.xd-quote)
          .xd-actions  (.votebar + btn btn-primary "Open on Airbnb")
```

- **Responsive:** `@container dx (max-width: 820px)` collapses `.dx.xd2` to one column;
  `@media (max-width: 700px)` makes `.dx-modalwrap` full-bleed (`padding: 0`,
  `align-items: stretch`) and `.dx-modal` `min-height: 100vh; border-radius: 0` — so on a
  phone it is a full-screen sheet, not a floating card.
- **States:** reviews loading → `.xd-quote` "Loading recent reviews…"; reviews absent → the
  whole `.xd-rev` block is omitted (fails silent by design); day chips absent when the trip
  has no day list; `daySaving` disables all chips (no spinner, no optimistic-fail affordance
  beyond a toast).
- **⚠️ Must stay portalled.** `.tab-panel` animates `transform` (`gp-panel` keyframes,
  `board.css` L485–486), which makes it the containing block for `position: fixed`
  descendants — an inline modal's `inset: 0` sized to the panel and the card landed
  clipped off-view ("dark screen, no popup"). See `experiences.md` §"THE popup bug".
- **Dead CSS:** `.xd`, `.xd-photo`, `.xd-body`, `.xd-title` (`detail.css` L222–225) are
  leftovers from the pre-portal sheet version and are no longer referenced by any TSX.

### 2.5 The leaderboard (`.xlb-*`)

"Where the votes go." Derived purely from `exp-votes` — no store, no tab.
`expGroupList()`: net ≥ 1, sorted by net then rating, **cap 10**; negatives excluded.

```
.xlb                (surface-raised, --border, --r-lg, --shadow-sm, 14/16 padding)
  .xlb-head         .xlb-title "Top of the list" · .xlb-sub "{n} in the running · ranked by group likes"
  ol.xlb-rows
    li > button.xlb-row[.lead]   style="--pct: {net/topNet*100}%"
      .xlb-rk       rank number (gold via --star on .lead)
      img.xlb-thumb 40px, --r-sm
      .xlb-main     .xlb-name (+ " · you liked" in --accent-text) / .xlb-meta ($price · duration · pinned day)
      .xlb-likes    "{net} likes"
  .xlb-actions      [Scout: plan our days] [Add list to trip plan (owner only)]
```

- **Support is a background tint, not a bar**: `.xlb-row::before` is an absolutely
  positioned fill of `width: var(--pct)` in `--accent-tint` (leader gets `--star-bg`),
  animated with `transition: width var(--dur-base) var(--ease-out)`. Rows reorder live —
  optimistic locally, ~8s poll for everyone else.
- `.xlb-main` **must** stay `display:flex; flex-direction:column` — name and meta are
  sibling `<span>`s and run together on one line otherwise.
- **States:** empty (nothing net-positive) → same `.xlb` shell, `.xlb-sub` reads "nothing
  ranked yet", body is a teaching line ("Hit 👍 on anything below and it climbs this list");
  **`.xlb-actions` is not rendered when empty**, so Scout is unreachable until someone votes.
  Populated → 1–10 rows.

### 2.6 Scout's plan panel

`div.ai-card` styled by `.tab-panel .ai-card` (`board.css` L548–553): `--accent-tint`
background, `--accent-tint-border`, `--r-lg`.

- `.ah` header: `.sp` 36px sparkle chip (raised surface, `--shadow-sm`, `--accent-text` icon)
  · `.at` **"Scout's plan"** (+ `· by votes` when `plan.fallback`) · `.as` sub-line
  ("{n} days from the group's votes · ~$X/person for everything (+n unpriced)").
- Owner-only `btn btn-primary btn-sm` **"Add to trip plan"** on the right.
- Body: **all inline styles** — a plain flex column of `.lb-sub` day headings with
  `.specs` rows, each an unstyled `<button>` reading `**Title** · duration · $price — why`.
  This body has essentially no design; it is the least-finished part of the surface.
- **States:** hidden entirely until a plan exists · `planning` swaps the trigger label to
  "Scout is planning…" · fallback plan (Gemini capped/down) is labelled and toasted
  ("Scout is resting — grouped your picks by votes instead") · errors toast only.

### 2.7 My plan panel (personal lane)

Same `div.ai-card` shell as Scout's plan — same accent-tint background, same `.ah`/`.sp`/
`.at`/`.as` anatomy. Differences: **the sparkle icon becomes a Bookmark**, the title is
**"My plan"**, and the sub-line reads either "{n} selected — Scout will plan exactly these"
or "{n} saved · private to you".

Actions (right of the header, inline flex): **Plan my days / Re-plan mine** (`btn btn-sm`),
**PDF** (`btn btn-ghost btn-sm`, links to the `.pdf` route), **Share my plan**
(`btn btn-primary btn-sm`, `navigator.share` → clipboard fallback + toast).

Body is the only properly-designed plan rendering: `.xplan` → `.xplan-day` (staggered
`gp-panel` entrance, `animationDelay: i*70ms`) → `.xplan-dh` (uppercase, 0.07em tracking,
`--accent-text`) → `.xplan-it` rows (42px thumb, `--surface-sunken`, `--border`, `--r-md`,
hover → `--surface-inset`, title + `$price · duration — why`).

**States:** panel hidden unless signed in AND (saves ∨ picks ∨ an existing plan) ·
`myPlanning` → "Planning…" · no saves and no picks → toast "Save or select a few things
first." · header-only when a plan hasn't been built yet.

### 2.8 Public share page `/s/plan/:tripId/:userId`

Fully **self-contained HTML with its own inline CSS** (`server.js` L313–356) — it shares
nothing with ds2 because the whole point is that people read it in the group chat without
the app. Hard-coded dark palette: `--bg:#121a18 --card:#182421 --line:#24322e --tx:#eaf2ef
--mut:#9db3ac --ac:#3fa88a`, system font stack, 640px `.wrap`.

Anatomy: `.tools` (Download PDF / Print) → `.hd` ("{Name}'s plan" + trip name · date range)
→ one `<section>` per day (`<h2>` full weekday in `--ac`, uppercase, 0.08em) → `ul > li.it`
(52px thumb, `.tx b` title, `.tx small` price · duration, `.go` "Open" outlink) →
`.cta` "Open the board & build your own plan" → `.ft` "Made with GroupPad · booking happens
on Airbnb". OG image = first activity's photo.

**States:** no trip → 302 to `/` · no plan → 302 to the board · plan with no resolvable
items → "No activities picked yet." · `?print=1` strips `.tools` and `.cta` server-side.

**Print / PDF variant.** `@media print` (L339–349) flips to an ink-friendly light theme
(white bg, `#111` text, `#137a5f` day headings), hides `.go/.cta/.tools`, and sets
`break-inside: avoid` on `section` and `.it` so a day never splits across pages. The PDF
route renders that same page with the Chromium already in the image (playwright-core):
Letter, `printBackground`, 14mm/12mm margins, rate-limited 10/5min, 20s timeout. On failure
it returns a plain-English 503 pointing at browser Print → Save as PDF — never a corrupt
download.

**This is the one surface with no ds2, no theming, and no light mode on screen.** It is also
the surface most likely to be seen by people who have never used GroupPad.

---

## 3 · Tokens & conventions actually in use

All from `client/src/ds2/tokens.css` (Layer 2 semantic tokens) — **no Experiences surface
defines a colour**.

| Group | Tokens referenced by Experiences CSS |
|---|---|
| Surfaces | `--surface-raised` (`.xlb`, `.sp`, `.xd-actions`), `--surface-sunken` (`.xplan-it`, thumbs), `--surface-inset` (`.xplan-it:hover`), `--surface-overlay` (`.save-btn`/`.star-btn`), `--scrim` (`.dx-scrim`) |
| Text | `--text`, `--text-2`, `--text-muted` |
| Lines | `--border`, `--border-strong`, `--photo-border` |
| Accent | `--accent`, `--accent-text`, `--accent-tint` (row fill + `.ai-card` bg), `--accent-tint-border`, `--ring` |
| Semantic | `--star` / `--star-bg` (leaderboard leader), `--up` / `--up-bg`, `--down` / `--down-bg`, `--under` / `--under-bg` / `--under-border` (Save $X + pinned-day badges) |
| Radius | `--r-sm` (thumbs), `--r-md` (rows, `.xplan-it`, `.btn`), `--r-lg` (`.xlb`, `.ai-card`), `--r-xl` (`.dx-modal`), `--r-pill` (badges, chips, votebar) |
| Type | `--font-display` (`.xlb-title`, `.at`, `.dx-title`, card `.title`), `--font-sans` body; sizes are mostly hand-set px in these blocks (13.5 / 12.5 / 11.5) rather than `--text-*` |
| Elevation | `--shadow-sm` (`.xlb`, `.sp`, overlay buttons), `--shadow-pop` (`.dx-modal`) |
| Motion | `--dur-fast` 150 / `--dur-base` 200 / `--dur-slow` 280, `--ease-out`, `--ease-standard` |

**Primitives reused as-is:** `.card` (+`.badge-row`/`.title`/`.specs`/`.save-btn`/`.star-btn`)
· `.badge` and `.badge-under` · `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-sm` (44px base,
36px sm) · `.chip-filter` (40px min-height pill; `.on` = accent tint + accent border) ·
`.fchip` on mobile · `.votebar` / `.votebar-row` · `.b-grid` · `.row-head` · `.tab` ·
`.ai-card` · `.tnum` (tabular numerals — used on every count and price).

**Motion patterns in play**
- `gp-panel` (`opacity 0 → 1`, `translateY(6px) → 0`, `--dur-base --ease-out`) on
  `.tab-panel` and on each `.xplan-day` with a 70ms per-day stagger.
- `gp-rise` card stagger on `.b-grid > .card` (35ms steps, capped at 200ms) from `motion.css`.
- **Width transition** on `.xlb-row::before` — the leaderboard's only "live" beat.
- `dx-pop` modal entrance: **transform only, never opacity** (a frozen clock must not be able
  to leave the modal invisible).
- `.vote` active scale 0.84, `.save-btn`/`.star-btn` hover scale 1.08.
- Everything sits under a `prefers-reduced-motion` guard in `motion.css`/`detail.css`.

---

## 4 · Interaction inventory

| Action | Where | What happens |
|---|---|---|
| **Vote 👍 / 👎** | card `.votebar`, dialog `.xd-actions`, mobile card buttons | Optimistic-with-rollback `castExpVote` → `POST /exp-votes`. Re-sorts the grid, re-ranks the leaderboard, animates `--pct`. Event `experience_voted` (with `surface`). Toggling the same direction clears the vote. |
| **Save (bookmark)** | card `.save-btn` — **desktop only** | Optimistic toggle → `POST /exp-saves`. Private per user. Unlocks the `Saved {n}` lens chip and the My-plan panel. Event `experience_saved`. Signed-out → sign-in prompt. |
| **Select for Scout (✓)** | card `.star-btn` — **desktop only** | Local `Set` only, never persisted. Defines exactly what "Plan my days" plans; empty selection falls back to all your saves. |
| **Open detail** | card body, leaderboard row, Scout-plan row, My-plan row | Portal dialog. Event `experience_detail_opened` with `surface: card \| leaderboard \| scout_plan \| my_plan \| mobile \| leaderboard_mobile`. ESC or the `.iconbtn` closes. |
| **Pin a day** | dialog `.xd-daychips` | Optimistic `POST /exp-days` (`experienceId → YYYY-MM-DD`, validated inside the trip window). Tapping the active chip unpins. Shows afterwards as a `.badge-under` on the card and in `.xlb-meta`. **A human pin always beats Scout's suggested day** when the plan is written to the itinerary. Event `experience_day_pinned`. |
| **Filter by vibe** | `.chip-filter` row / mobile `.fchips` | Client-side regex match on category+title (`EXP_VIBES`, 6 vibes). Only vibes with ≥2 matches render, each with a live count. Event `experiences_vibe_filtered`. |
| **Saved lens** | `Saved {n}` chip | Filters the grid to your saves. Composes with the vibe filter. |
| **Sort: Nearest** | `.rh-right` toggle / mobile `.sec-h` button | Only offered once a decision is locked *and* `expAnchor()` resolves a point. Sorts by straight-line haversine; items without coords sink. Default sort otherwise: net votes → rating → price. |
| **Refresh** | `.rh-right` | Re-spawns the scraper (also auto-respawns on 24h staleness or missing schema keys). A 0-result scrape never overwrites a good file. |
| **Scout: plan our days** | `.xlb-actions` — **desktop only** | `POST /plan-experiences`, group-wide, cached by votes+dates hash, ≤2 items/day and ~6h/day, per-item "why". Deliberate, never automatic. `heuristicPlan` fallback when Gemini is capped/down. Events `experiences_planned`. |
| **Add list to trip plan** | `.xlb-actions`, **owner only** | Appends a formatted block to the itinerary (Discussion → Trip plan). Event `experiences_sent_to_itinerary`. |
| **Add Scout's plan to trip plan** | Scout panel, **owner only** | `expPlanToItinerary()` — re-homes pinned items onto their chosen day, creates missing days, drops empties, sorts by date. Event `experiences_plan_saved`. |
| **Plan my days** | My-plan panel | `POST /my-plan` with the selected (or saved) ids. Stored per user, never touches the group plan. Event `my_plan_built`. |
| **Share my plan** | My-plan panel | `navigator.share` → clipboard fallback + "Link copied — paste it in the group chat." Event `my_plan_shared`. |
| **PDF** | My-plan panel + the share page itself | `GET /s/plan/…/.pdf`. Event `my_plan_pdf`. |
| **Open on Airbnb** | card foot, dialog action, share-page `.go` | The only booking path. Event `experience_outlink`. |

---

## 5 · Rough edges — the actual design questions

1. **A one-entry leaderboard is embarrassing.** With one net-liked item, `--pct` is 100%, so a
   single row is fully tinted and the panel reads as "the winner" when it's really "one person
   clicked something." *How should rank 1-of-1, 1-of-2, 1-of-3 look versus a real field of 10?
   Should the tint be absolute (net/party size) rather than relative to the leader?*
2. **The card carries five competing badges.** `Save $X`, pinned day, `Group rate`, category,
   `★4.98 (312)` all sit in a non-wrapping `space-between` row above a display-font title, in a
   grid cell that can be a quarter of a 1520px board. *What's the badge budget — two? Which of
   these are identity (category), which are urgency (discount), which are metadata (rating) —
   and should they live in different zones?*
3. **Two overlay buttons on one photo is probably one too many.** Bookmark (save, persistent,
   private) and Check (select for Scout, ephemeral, local-only) are visually near-identical
   34px circles 42px apart, and "selected" is nearly invisible on the card. *Does select
   need to be on the photo at all — could it be a mode ("pick things for Scout") the panel
   turns on, or a checkbox in the card body?*
4. **Scout's plan and My plan are the same component.** Same accent-tint `.ai-card`, same
   header anatomy, same width, stacked adjacently — only the icon (Sparkles vs Bookmark) and
   the title differ. One is the group's shared opinion, one is private to you. *How do we make
   "ours" and "mine" read as different kinds of thing at a glance?*
5. **The two plan bodies don't even match each other.** Scout's plan body is unstyled inline
   flex + `.specs` text rows; My plan gets the designed `.xplan-*` rows with thumbnails and a
   staggered reveal. The better one should probably win both.
6. **Day chips have nowhere to go on a phone.** A 7-night trip means 7+ `.chip-filter` chips
   (each ≥40px tall, ~9px/14px padding) wrapping inside a modal that is already full-screen
   on mobile, pushing reviews and the vote/CTA row below the fold. *Scroller? Segmented
   control? Compact date pills?*
7. **The desktop tab bar is now six tabs.** Recommended · Shortlist · Saved · To do ·
   Decision · Discussion, each with a pip, forced to one line by `white-space: nowrap` on
   `.tab`. It fits today and it is ragged. *Is "To do" a peer of "Shortlist", or does the
   board want a two-level structure (homes vs. the trip)?*
8. **Mobile is missing the whole personal lane** (save, select, Scout plan, My plan, share,
   PDF) — see §2.2. Sharing a plan into a group chat is a phone behaviour; it currently only
   exists on desktop.
9. **There is no error state anywhere.** Every read is `.catch(() => {})`. A failed
   experiences fetch renders as "No things to do found for this trip yet." *What should a
   real failure look like, and is it different from an honest empty?*
10. **The share page is a different product visually.** Hard-coded dark teal, system fonts,
    no skins, no light mode on screen (only in print). It's the surface strangers see first.
11. **`justify-content: space-between` on `.badge-row`** means 2 badges sit at opposite edges
    of the card with a hole in the middle — inherited from the homes card, wrong here.
12. **Refresh replaces the whole list**, so a voted-on experience can vanish from the UI while
    its votes stay in the store (currently zero orphans, but it's a live risk for the
    leaderboard's credibility).
13. **`.xlb` and `.ai-card` don't share a shell.** Three stacked panels on the To-do tab use
    three different backgrounds (`--surface-raised`, `--accent-tint`, `--accent-tint`) and
    two different border treatments — the tab reads as a stack of unrelated boxes above a grid.

---

## 6 · Hard constraints (non-negotiable)

1. **ds2 tokens only.** No new colour system, no new palette, no hex literals in ds2 CSS.
   New tokens, if genuinely needed, get added at the semantic layer in `tokens.css` and
   defined for **light and dark**.
2. **Six skins × two themes.** `data-skin` = `classic | tropical | coastal | sunset |
   pinksummer | forest`, each × `data-theme` = `light | dark` (`ds2/themes.css`). A skin
   remaps accent/decision/surface tint only. **Nothing may hardcode a colour** — anything that
   does breaks in five of six skins. (`ExperiencesSection.tsx` currently has a couple of inline
   `style` colour references — they use `var(--accent…)`, keep it that way.)
3. **Mobile ≤520px is a separate shell.** `useIsMobile(520)` swaps in `MobileBoard`; its CSS is
   scoped under `.gp-mobile` in `mobile-app.css`. **Reusing a class across shells silently
   fails** — `.ai-card` was defined only as `.gp-mobile .ai-card`, so the Scout and My-plan
   panels rendered completely unstyled on desktop until `.tab-panel .ai-card` equivalents were
   added. Check the selector prefix before reusing anything.
4. **A fixed-position overlay must NOT be rendered inside `.tab-panel`.** It animates
   `transform`, which makes it the containing block for `position: fixed` descendants. Any
   modal, sheet, popover or toast on this tab must go through a portal. This broke the dialog
   once and no amount of CSS on the modal could fix it.
5. **Scout output is always attributed.** Sparkle icon + a "Scout" label on every AI-produced
   block, so a member can always tell a machine opinion from a group decision. Buttons are
   "Ask Scout" (personal) or "Scout: <verb>" (group) — never "AI", never bare "Generate".
6. **Scout never mutates group state.** A human presses the button that writes to the
   itinerary. Owner-only actions stay owner-only.
7. **GroupPad never books.** No "Book now", no price-lock language, no availability claims, no
   basket. Every outbound CTA is "Open on Airbnb"; the standing footer line "booking happens on
   Airbnb" must survive any redesign of the header/share page.
8. **Distances say "from", not "drive"** — straight-line haversine, anchored on the chosen
   home's coords when available, otherwise the trip's primary ref point with an honest label.
   No anchor → hide all distance UI. Never imply door-to-door precision.
9. **Accessibility floors already met:** 44px `.btn` / 40px `.btn-sm` and `.chip-filter` touch
   targets, `--text-muted` darkened specifically to clear WCAG AA on cream, `aria-pressed` on
   both overlay toggles, `.sr-only` dialog title, focus rings via `--ring`. Don't regress these.
10. **Do not re-position `.save-btn` / `.star-btn`** without deleting the base rules — the base
    CSS already separates them (52px / 10px).

---

## 7 · What would most benefit from a redesign — ranked

| # | Target | Why it's here |
|---|---|---|
| 1 | **The experience card** | It's the atom, it's on screen 40× per board, and it's the most overloaded thing in the feature: 5 badges in a non-wrapping row, 2 near-identical photo overlays, an invisible selected state, and a price line that has to carry discount + unit + per-person split. Fixing the card fixes the grid, the mobile list, and half the visual noise. |
| 2 | **The three stacked panels (leaderboard + Scout plan + My plan)** | Right now they're three boxes with two background treatments, two different plan renderings, and an "ours vs mine" distinction that reads as identical. This is the feature's actual story — *the group's answer, the machine's proposal, your own version* — and the layout doesn't tell it. |
| 3 | **The leaderboard at low N** | The moment that decides whether the vote mechanic feels alive or embarrassing is the *first* vote, and today that's a solid tinted row saying "1 like". Design the 0 → 1 → 3 → 10 progression deliberately. |
| 4 | **Mobile To-do parity** | The personal lane (save → plan → share) is a phone behaviour that only exists on desktop. Deciding what belongs in the ≤520px shell is a design call before it's an engineering one. |
| 5 | **The detail dialog's information order** | Landscape works; the ordering doesn't. Day chips (a commitment) sit above reviews (evidence) and the vote/CTA row sits at the bottom, and on a phone the whole thing is a full-screen sheet where day chips can eat the fold. |
| 6 | **The share page** | Highest-leverage per pixel — it's the surface non-users see, it's the growth loop, and it currently shares no visual language with the product. |
| 7 | **Empty / pending / error states** | Three distinct situations render as one paragraph and an icon, and errors don't exist at all. Cheap to fix, disproportionate effect on how finished the feature feels. |
| 8 | **The six-tab bar** | Structural, contested, and probably a later conversation — but it's the frame everything above sits inside. |

---

## Screenshots (captured from production, 2026-08-11)

All shots are of the **live** feature at `grouppad.goldhac.com`, retina (2–3×), in the
default dark skin. Files live in `docs/specs/screenshots/`. Note the board shots are
signed-OUT, so the **My plan** panel (personal lane) is absent from them — see the
share page and PDF shots for how that content looks.

| # | File | What it shows |
|---|------|---------------|
| 01 | `01-desktop-todo-tab.png` | The whole "To do" tab: tab bar, section head with Nearest/Refresh, leaderboard, Scout's plan panel, vibe chips, card grid |
| 02 | `02-leaderboard.png` | `.xlb` ranked list — rank, thumbnail, title + meta, support tint, like count, actions |
| 03 | `03-scout-plan-panel.png` | Scout's plan panel (`.ai-card`) — sparkle badge, day headings, per-item "why" |
| 04 | `04-experience-card.png` | A single card: Save-$ and rating badges, title, price/duration/distance facts, vote bar, Airbnb outlink, save + select overlay buttons |
| 05 | `05-desktop-dialog-landscape.png` | The portal dialog on a laptop — `.dx.xd2` two-column landscape, photo left, facts + day chips + reviews + actions right |
| 06 | `06-mobile-todo.png` | Mobile "To do" at 390×844 — top bar, leaderboard, vibe scroller, mcards |
| 07 | `07-mobile-dialog.png` | The same dialog on a phone — stacked, scrolling body, pinned actions |
| 08 | `08-share-page.png` | The public `/s/plan/...` page a group member opens from the chat |
| 09 | `09-share-print-pdf.png` | The print/PDF variant — light theme, interactive chrome stripped |

**Re-capture:** these were produced with a short Playwright script (viewport +
`deviceScaleFactor`, click into the To do tab, screenshot whole page and individual
elements). Re-run it after any visual change so the packet never goes stale.

### Two fixes made while capturing these
- **Card facts wrapped mid-item** — the clock icon sat on one line and "1h" on the
  next (same for the distance pin). The card inherited the homes `.specs` rule.
  Added `.specs.xspecs`, where each fact is an unbreakable inline-flex unit and
  wrapping happens only *between* facts. Shot 04 is the fixed version.
- **PDF was 4.5 MB** because the share page fed full-resolution photos into 52px
  thumbnails. Now requests `?im_w=240` → **335 KB (-93%)**.
