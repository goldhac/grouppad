# Handoff: GroupPad — Plan screens (public share page + in-app plan)

Two surfaces, one design language:

| File | What it is |
|---|---|
| `GroupPad Shared Plan.html` | The **public share link** — read-only, print-safe, premium editorial. What someone sees when a member shares their plan. |
| `GroupPad Plan Screen.html` | The **in-app plan** — three collapsible panels (group's answer / Scout's proposal / your private plan) plus the redesigned share modal. |

Open either in a browser. No build step, no server.

---

## File map & load order

```
GroupPad Shared Plan.html      → ds2/tokens → ds2/skins → share/share-premium.css
                                 icons/icons.js → share/share-icons.js → share/share-premium.js

GroupPad Plan Screen.html      → ds2/tokens → ds2/skins → ds2/components → ds2/patterns
                                 → plan/plan-collapse.css
                                 icons/icons.js → share/share-icons.js → plan/plan-collapse.js
```

**Load order is not optional.** `share-icons.js` aliases glyphs out of `window.GP_ICONS`, so `icons/icons.js` must load first or five icons render empty. CSS cascades tokens → skins → components → patterns → page.

| Path | Role |
|---|---|
| `ds2/tokens.css` | Two-layer tokens (palette → semantic), light + dark. **Unmodified.** |
| `ds2/skins.css` | The `data-skin` layer. **Modified:** added the `forest` skin. |
| `ds2/components.css` | `.btn`, `.badge` families. **Use these — don't re-roll them.** |
| `ds2/patterns.css` | §10 `.progress` meter (`.ptop`/`.ptrack`/`.pfill`), `.leaderboard`, `.lb-bar`. |
| `icons/icons.js` | **Canonical** signature icon registry (`window.GP_ICONS`). |
| `share/share-icons.js` | Itinerary extension (`window.GP_TRAVEL`) — 26 new glyphs + 5 aliases. |
| `share/share-premium.*` | The public share page. |
| `plan/plan-collapse.*` | The in-app plan screen + modal. |

---

## Non-negotiables (each of these was a review defect — please don't reintroduce)

1. **Tokens only. Zero hex literals** in page CSS. Every pill radius is `var(--r-pill)`, never `100px`.
2. **Use the ds2 component, never a lookalike.** Buttons are `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-sm`. Pills are `.badge` (+ modifiers). The "X of N voted" meter is `patterns.css` `.progress`. If you catch yourself writing `display:inline-flex; border-radius:…; padding:…` for a pill, stop — that component exists.
3. **The gold dot (`#D7A12E`) marks decisions only.** `icons/icons.js` line 3 is the rule. `seal` (gold) is for the group's answer / official pick. A private draft and a day summary are **not** decisions — they use `bookmark` and `flag`. `house` deliberately differs from `peak` by dropping the dot.
4. **Icons come from the registry.** Never re-draw a glyph that exists in `GP_ICONS`; alias it (`from('official-pick')`). Spec for new ones: 24px viewBox, ~20px live area, stroke 1.75, round caps/joins, `currentColor`.
5. **No stock icons, no emoji.** The old 🚗 and `└,` ASCII arrow are gone and should stay gone.
6. **Never "book".** Every outbound exit is *Open on Airbnb*. These surfaces don't transact.
7. **Scout stays attributed.** Labelled *proposal*, visually tinted, never mistakable for a group decision, and nothing it proposes mutates shared state until someone acts.

---

## Screen 1 · The public share page

Design language borrowed from luxury-travel itineraries (Aman, Belmond, Black Tomato): full-bleed photography, hairline rules instead of boxes, chapter numerals, wide-tracked small caps, one metallic accent.

**Structure:** cinematic hero (600×290 photo, dual-gradient scrim, gold-ruled byline, 62px display title) → editorial **ledger band** (Planned / Out of the house / Behind the wheel / Per person) → day chapters → CTA → fine print.

**The timeline** is a continuous hairline rail with alternating stops and travel legs:
- `.stop` — accent node + halo, photo, display-type name, facts, reasoning
- `.stop.filler` — hollow node; something Scout invented (coffee, lunch)
- `.stop.anchor` — muted; leaving/returning home, context not activity
- `.leg` — the drive glyph sits **on** the rail in a circular break; carries mode + duration + distance + the *because*
- `.itin-gap` — a named hole, never auto-filled

**Reasoning is a pull-quote** (`.sp-why`, gold left rule), not an ASCII arrow.

**Print CSS is real** — `Download PDF` / `Print` both call `window.print()` and produce a document on white paper with dark ink, the hero cropped to a 132px band, `break-inside: avoid` on days/stops/CTA, and the chrome hidden.

### Data shape (`PLAN` in `share-premium.js`)
```js
{ author, initial, place, trip, dates, party, hero, daysPlanned, daysTotal,
  out, driving, pp,
  days: [{ n, date, arc, out, driving, pp, items: [ … ] }] }
```
Each `item` is one of:
- stop — `{ k:'stop'|'filler'|'anchor', t, nm, dur, pp, tag, img, why }`
- leg — `{ k:'leg', mode:'drive'|'walk', dur, mi, aside, long }`
- gap — `{ k:'gap', txt }`

---

## Screen 2 · The in-app plan

### The problem this solves
Every day carried **one** real activity inside eight rows of identical scaffolding: leave the house → drive → detour → activity → empty-evening notice → drive → home. Four days ran ~2,000px to convey four things. Nothing collapsed.

### The four moves
1. **A day collapses to one 62px row** — gold weekday, date, thumbnail, activity name, then time-out / driving / per-person right-aligned. Four days now read in ~250px. Click to expand into the routed timeline.
2. **House bookends absorb their adjoining drive.** `.pl-bookend` renders *"Leave the house **9:30a** · 🚘 ~45 min 29.7 mi — a long haul, most of a morning"* as one muted line. Removes four rows per day.
3. **Detours and gaps are inline notes**, not boxes. The redundant "ON THE WAY / right on the way / optional" triple is one line with an Add affordance; the empty-evening banner is a dashed rule + "Find something".
4. **Panels collapse independently** and show a `.pl-digest` when closed (*"4 days · 4 activities · $253 pp"* + stacked thumbnails) rather than nothing.

A **Compact / Full** segmented control drives every day at once.

### Layout rule that matters
`.pl-dayrow` is `grid-template-columns: 22px 68px 1fr auto` and `.gist` is `display:none` when open — so `.figs` **must** carry `grid-column: 4; justify-content: flex-end;` or it reflows into track 3 and the price jumps ~800px on every toggle. The ≤860px override (`grid-column: 2 / -1`) intentionally stacks it on mobile; keep both.

### The three panel kinds
| Kind | Class | Treatment | Mark |
|---|---|---|---|
| The group's answer | `.k-group` | solid, strong border, shadow | `seal` (gold — a decision) |
| Scout's proposal | `.k-scout` | `--accent-tint` fill, labelled *proposal* | `sparkles` (no gold) |
| Yours | `.k-mine` | inset, gold-tinted left rail, *Private to you* | `bookmark` (no gold) |

### Leaderboard — keep this as-is
`.pl-lbrow` fills the **whole row** background to `--pct: net ÷ party` (set inline). This is the absolute measure from the Phase-1 pass: one vote of fourteen fills 7%, not 100%. It is deliberately *not* `patterns.css` `.lb-bar`, which has a separate track under the name. The quorum meter beneath it **is** the shared `.progress` component.

### The modal
Tight header (no dead space), a **day-pill strip** so a four-day plan is navigable without scrolling, per-day collapse, Expand/Collapse all, sticky footer. Escape closes. Under 560px it becomes a bottom sheet and footer buttons go full-width.

### State (`S` in `plan-collapse.js`)
```js
{ panels: {group, scout, mine},   // panel open/closed
  open: Set,                      // 'mine-0' | 'scout-0' — screen days
  modalOpen: Set,                  // 'm-0' … — modal days
  modal: false, density: 'compact' }
```
Full re-render on every change. Event delegation order matters: **explicit actions (`data-open-modal`, `data-jump`, `data-density`) are checked before** the row/panel toggles they're nested inside, otherwise a header button collapses its own panel.

---

## Porting checklist

1. Copy the `forest` block from `ds2/skins.css` if you don't have it.
2. Load `icons/icons.js` **before** `share-icons.js` on any page using `GP_TRAVEL`.
3. Wire `leg.dur` / `leg.mi` to real routing; wire stop tags to real vote/pin state.
4. Keep the gap admission — do **not** auto-fill it to look complete.
5. Keep clock-time / reasoning / leg internally consistent. If you move a stop's time, rewrite its reasoning and recompute the day totals (the demo day proves this: morning skate lesson "cool before noon", lunch-timed taco crawl, downtime anchor, night hike at 7:30p with sunset at 7:48).
6. Verify all 12 skin × theme combinations, plus 4 / 2 / 1-column and the ≤560px sheet.
7. Print-test the share page — it's a document, not a screenshot.

## Known placeholders
Unsplash photos are stand-ins with `onerror` fallbacks to the brand monogram. Swap for real experience imagery; keep the guard.
