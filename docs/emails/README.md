# Handoff: GroupPad — Early-access announcement email

`07-early-access-scout.html` — a love letter to early users plus the launch of **Scout's routed day**.

## Run it
Open the HTML in a browser. No build step. Keep it next to `assets/` or the logo breaks.

```
07-early-access-scout.html
assets/logo-2x.png        ← referenced by the email
assets/seal-2x.png        ← unused here; included so the folder matches emails/assets
```

This is #7 in the sequence (`emails/01-founder-welcome.html` … `06-official-pick.html`) and follows those files' conventions exactly. If you touch it, read `06-official-pick.html` first — it's the closest sibling.

---

## Build conventions (all six existing emails do this)

- **Tables for layout.** `role="presentation"`, `cellpadding="0" cellspacing="0"`, nested tables for columns. No flexbox, no grid.
- **Every critical style is inline.** The `<style>` block is progressive enhancement only — responsive + dark mode. Assume it gets stripped.
- **600px card** on a `#EFE7DA` page, `#FFFDF8` card, `18px` radius, `1px solid #E7DDC9` border.
- **Bulletproof buttons.** VML `<v:roundrect>` for Outlook inside `<!--[if mso]>`, anchor fallback inside `<!--[if !mso]><!-- -->`. Keep both branches in sync (label, href, width, color).
- **Hidden preheader** — the `display:none;max-height:0` div right after `<body>`. It's the inbox preview line; update it if the story changes.
- **Relative asset paths** — `assets/logo-2x.png`. The ESP rewrites these at send. **Do not hand-write a CDN hostname**; an invented absolute URL 404s and the logo renders blank.

### Palette (hex, inline — this is email, not the app)
| Role | Light | Dark override |
|---|---|---|
| Page bg | `#EFE7DA` | `#0F1716` |
| Card | `#FFFDF8` | `#15201E` |
| Border / rule | `#E7DDC9` | `#2C3936` |
| Ink | `#16201E` | `#EDE7D9` |
| Muted | `#5F6B68` | `#B9C0B9` |
| Footer | `#7B847D` | `#98A19B` |
| Accent (teal) | `#134E4A` | — |
| Eyebrow / link | `#2E8C7C` | `#7FD6C2` |
| Gold pill | `#FBF0D6` / `#EBD9A8` / `#8A6A12` | `#2A2415` / `#4A3F22` / `#E3C367` |
| Panel | `#F8F3E7` | `#121B1A` |
| Day-wrap bar | `#F1EADA` | `#18231F` |
| "Voted in" tag | `#DFF0E4` / `#1F6F4A` | — |

**Type:** `'Bricolage Grotesque', Georgia, 'Segoe UI', sans-serif` for display · `'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, sans-serif` for body · `'Courier New', Courier, monospace` for stop times.

---

## ⚠️ Dark mode: the one rule that bites

Dark mode works by class overrides in the `<style>` block (`.ec-ink`, `.ec-muted`, `.ec-rule`, `.ec-panel`, …). An inline `color:` with **no `ec-*` class never flips**, so dark teal stays on a dark card.

**Any element with `color:#134E4A` must also carry `class="ec-ink"`.** The inline hex is the light value; the class flips it to `#EDE7D9`. This is what `06-official-pick.html` does on its display heading and its `$5,022` figure.

This was a real bug in review — h1, h2, wordmark, day head, two stop times and the wrap label all measured **1.71–1.92:1** against WCAG's 3:1 minimum. Fixed, but re-check it any time you add a heading.

Verify by toggling your OS to dark and reloading.

---

## Structure

| # | Block | Notes |
|---|---|---|
| 1 | Brand bar | **Outside** the card on the page bg — logo, wordmark, gold `Early access` pill |
| 2 | Hero | Full-bleed 600×290 photo, `border-radius:17px 17px 0 0`, collapses to 210px on mobile |
| 3 | Headline | "You were here / before it worked." — hard `<br/>`, intentional |
| 4 | Love letter | Three paragraphs |
| 5 | Feature reveal | Teal eyebrow → h2 → two paragraphs |
| 6 | **Routed day** | The centrepiece — see below |
| 7 | Photo strip | 3-up, "Pulled from your group's votes" |
| 8 | Trust + CTA | The two deliberate-choices paragraph, then the button |
| 9 | Sign-off | Ask for feedback, `— Gold`, reply-to invite |
| 10 | Footer | Why-you-got-this + Help + **Unsubscribe** |

### The routed day (block 6)
Two-column rows inside a tinted panel: a 60px cell holding a 52px rounded thumbnail, and a content cell with the monospace time, name + tag, then facts and reasoning. Travel legs are their own row — empty 60px spacer, then `🚗 14 min drive · 6.8 mi — out to the coast before the boardwalk fills up`.

**The tags carry the trust model and must stay distinguishable:**
- `Voted in` — green (`#DFF0E4`/`#1F6F4A`) — the group chose it
- `Scout added` — grey (`#EFE7DA`/`#7B847D`) — Scout invented it (coffee, lunch)

A reader must always be able to tell what the machine made up from what the group decided. Don't unify these.

The panel closes with the day wrap: **"That's a wrap for Monday · 1 hr 9 min driving · $176 pp."** If you edit any stop or leg, recompute those totals — 10+14+18+12+15 = 1 hr 9 min, and $6+60+75+35 = $176.

---

## Copy rules

- **Specific gratitude, not generic.** The email names what early use actually changed ("that's why votes are public, why the per-person number sits on every card"). Don't flatten this into "thanks for your support."
- **Never "book".** This product doesn't transact. The footer's price disclaimer stays.
- **Scout is a proposal, never a decision** — stated outright, and reinforced by the tags.
- **Gaps get admitted, not filled.** Scout says when there's nothing planned rather than inventing filler.
- Voice: plain, concrete, a little self-deprecating about the early days ("half the buttons did nothing").

---

## Responsive
One breakpoint at `600px`: card goes full-width and square-cornered, padding drops to 22px, hero to 210px, h1 → 27px / h2 → 21px, the photo strip stacks (`.ec-col` → block), the day-wrap bar stacks left-aligned, and the CTA goes full-width.

---

## Before you send

1. **Swap the Unsplash photos** for real experience images. Hotlinking Unsplash in bulk mail is unreliable — self-host or use your CDN. Keep `width`/`height` attributes and `display:block` on every `<img>`.
2. Confirm the ESP resolves `assets/logo-2x.png`.
3. Point the three `grouppad.app/#/…` links at production; wire `#/unsubscribe` to the real list-unsubscribe.
4. Merge tags: the email opens "Hi there," — swap for a first-name token if you have one.
5. Test Gmail (web + iOS + Android), Apple Mail, and Outlook 2016/365 — Outlook is the VML path and won't render `border-radius` or `object-fit` (squares are the expected degradation).
6. Toggle dark mode and re-read the contrast rule above.
