# GroupPad — Sitemap, Features & Guided-Onboarding Design

_Generated from a full-site scan (see `docs/screenshots/`, 14 frames @1440×900)._

## Sitemap (HashRouter)

| Route | Screen | Auth | Screenshot |
|---|---|---|---|
| `/#/` | Product landing (hero, core-loop demo, features, CTA) | public | `01-landing` |
| `/#/trips` | Your-trips dashboard | signed-in | `04-trips-dashboard` |
| `/#/trips/new` | Create-a-trip flow | signed-in | `05-create-trip` |
| `/#/t/:id/board` | **The board** — the core experience | view public / act signed-in | `06,07` |
| `/#/t/:id/manage` | Organizer manage (members, transfer, delete, voting) | owner | `10-manage` |
| `/#/t/:id/help` | How-it-works | public | `11-help` |
| `/#/admin` | Platform admin (super-admin / key) | super-admin | `12-admin` |
| `/#/terms`, `/#/privacy` | Legal | public | — |
| modals | Auth, Onboarding tour, Detail, 1v1/VS Compare | — | `02,08,09` |

## The board — tabs & features

- **Recommended** (`07-board-full`): top-10 ranked homes, grid⇄list toggle, borderless image-forward cards (per-person, budget fit, vote, save, compare). Below: **Community submissions** + **Live listings** (same card, "See all" cap, follow the grid/list toggle).
- **Shortlist** (`07b`): net-voted finalists. Scout banner (Ask Scout / 1v1 / criteria chips / weigh-input) + full-width cards + expandable "Scout's full analysis" (top picks, comparison table, red flags).
- **Saved** (`07c`): the user's private favourites + **"Ask Scout — for me"** (personal ranking, not shared).
- **Discussion** (`07d`): **Group criteria** request→approval (members request, organizer approves → feeds Scout) + the trip itinerary.
- **Decision**: top-choice leaderboard + the gold "official pick" lock (Lottie seal).

## Card anatomy (the atom)
Photo (badges overlaid: rank/budget; save-bookmark + top-choice star) → title → meta (source · area · specs · ★rating) → all-in + **per-person** → vote bar + Compare. Click → Detail modal (full info, distances, amenities, reviews, tour, Save / Top-choice / Compare / Make official).

## What makes us *not* Airbnb (surface in onboarding)
1. **Per-person split** — every price divided by the group.
2. **Vote in the open** — homes rise into the Shortlist at net +1.
3. **Scout** — group AI ranks against *approved* group criteria; personal Scout ranks your Saved.
4. **Budget fit** — under/over budget signalled everywhere.
5. **Lock the official pick** — the gold seal moment.

---

## Guided onboarding tour — design spec (coachmark / spotlight style)

In-context tour that fires once on a member's **first board visit** (gated by `localStorage gp_onboarded` — same flag the modal tour uses; this replaces/augments it). Each step spotlights a real element with a tooltip (title + body + Back/Next + "n of N" + Skip), like the LottieFiles Creator tour.

| # | Target (selector) | Title | Body |
|---|---|---|---|
| 1 | `.b-controls .tabbar` | Your group's board | Everything for this trip lives here — browse, vote, compare, decide. |
| 2 | `.b-grid article.card .card-money` | The number that ends the debate | Every home shows the all-in cost **and what each person pays**. |
| 3 | `.b-grid article.card .votebar` | Vote in the open | Thumbs-up the ones you like. At net +1 a home rises into the Shortlist. |
| 4 | `.b-grid article.card .save-btn` | Save your own picks | Bookmark homes to your private **Saved** list — only you see it. |
| 5 | `.b-controls .filters-btn` (Refresh too) | Refine & refresh | Filter by budget/pool/parking; the organizer can pull fresh listings. |
| 6 | `.tab[Shortlist]` → Scout banner | Let Scout decide | Ask Scout to rank the shortlist against your group's criteria. |
| 7 | `.tab[Discussion]` criteria | Tell Scout what matters | Request a must-have; the organizer approves it, then Scout weighs it. |
| 8 | `.tab[Decision]` | Lock it in | Cast a top choice; the organizer seals the official pick. |

**Build approach:** a lightweight custom `<GuidedTour>` (spotlight via a full-screen scrim with a cut-out box positioned over the target's bounding rect + a tooltip popper). No heavy dep needed; ~1 component + a steps array. Honors reduced-motion; Skip persists `gp_onboarded`.
