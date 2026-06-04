# GroupPad — Design Briefs (3 features)

Paste one brief at a time into Claude Design. Each is self-contained.
Point Claude Design at the repo `github.com/goldhac/grouppad` (branch `main`),
`DESIGN_REFERENCE.md`, and `docs/screenshots/`. Live: https://exquisite-inspiration-production-7511.up.railway.app

## Shared design language (applies to all three)
Dark-first, premium (Linear / Vercel / Airbnb quality), **no AI-slop**: no rainbow/multi-stop
gradients, no neon glow, no emoji-as-icons (icons = **lucide**, single stroke weight), restrained
elevation (one small shadow scale), **one accent** used with discipline (CTAs + active state only),
real type rhythm with **tabular figures** for prices/ratings/distances, 4px spacing grid,
150–250ms ease-out motion, AA contrast, visible focus rings, 44px touch targets. Theme tokens are
CSS vars: `--bg --panel --panel-2 --border --text --muted --accent --warn --danger --link`
(consumed via Tailwind). Stack: React 18 + TS + Tailwind + Radix.

---

# ① Email reminders & alerts
A transactional email system + small in-app controls. Members get a **daily digest** of trip
activity and **instant alerts** for big moments; the organizer can invite by email; every user can
manage their email prefs.

**Design these surfaces:**

**A. Email templates** (HTML emails — table-based, inline CSS, email-client-safe; **light** background).
One shared shell (branded header with GroupPad wordmark → eyebrow label → title → body → ONE CTA
button → footer with unsubscribe). Five variants:
- **Sign-in link** (magic link) — "Tap to sign in", expires in 15 min.
- **You're invited** — "{Inviter} invited you to {Trip}", Join CTA.
- **New member joined** — to the organizer.
- **It's official** — the final pick is locked, "{Listing} is the group's pick", See-the-pick CTA.
- **Daily recap (digest)** — a tidy list of stat rows ("3 new homes", with 1–4 sample lines each;
  "12 votes"; "2 must-haves"), Open-the-board CTA.
Want: a premium, on-brand email look (current one is clean but plain). Define header, eyebrow,
title, body, button, divider, footer, and the digest "stat row" component.

**B. Notification preferences modal** (in-app, dark; opened from the navbar account menu).
Two labelled toggles: **Daily recap** and **Big moments**. States: loading, saving, on/off.

**C. Invite-by-email box** (in-app, on the Manage page): a textarea (comma/space-separated emails) +
"Send invites" button. States: idle / sending / sent.

**D. Unsubscribe confirmation page** (standalone, server-rendered): "You're unsubscribed" / "Link
expired", a line of copy, a back-to-GroupPad link.

Components to design: ① the email shell + 5 body layouts + the digest stat-row ② the prefs modal +
toggle ③ the invite box ④ the unsubscribe page.

---

# ② Guest reviews (last 4 👍 / 4 👎)
Show real guest-review snippets per listing, split by sentiment, so the group can sanity-check a
place. Data per listing: `{ pos: [{text, rating(1–5), date, author}], neg: [...], total }`.

**Design these surfaces:**

**A. Listing detail modal — "Guest reviews" section.** Two scannable columns:
**Loved it** (👍, accent-tinted) and **Concerns** (👎, warn-tinted), each up to 4 review cards.
A card = star rating (tabular) + author + date + the review text. Header shows total count.
States: **ready** (the two columns), **loading** ("Loading reviews…"), **none** ("No written
reviews available"), **signed-out** ("Sign in to load guest reviews").

**B. Listing card — compact review peek.** Under the existing aggregate line ("4.88★ (8 reviews)"),
a small peek: one short pull-quote (italic, 2-line clamp) + a "👍 4 · 👎 0" tally + a "read reviews"
link. Only shows once reviews are cached. Keep it quiet — it's a secondary signal, not a headline.

Make the two columns feel premium and easy to skim; sentiment color used with restraint (accent vs
warn), never loud. Stars use tabular figures.

Components to design: ① the reviews section (2-column, with the 4 states) ② the single review card
③ the card review-peek.

---

# ③ Walkthrough tour videos
A short auto-generated video tour of a listing's **best spaces** (exterior shot first, then pool /
games room / great room…). Gemini picks the wow photos → fal.ai animates each into a ~10s cinematic
house-tour clip → they play back-to-back as one tour. Generated when a listing becomes a group ⭐
top choice (or via an organizer button); cached per listing.
Data: `{ status: "generating" | "ready", clips: [{ feature: "Pool", videoUrl, photo }] }`.

**Design these surfaces:**

**A. Listing detail modal — "Walkthrough tour" block** (sits high, right under the photo gallery).
Four states:
- **Ready** → a 16:9 video player that plays the clips in sequence, with a row of clickable
  **feature chips** ("Exterior", "Pool", "Great room") to jump between clips. This is the hero —
  make it feel like a polished property-tour module (not a bare `<video controls>`).
- **Generating** → a "Generating a walkthrough of the best spaces…" state that feels alive (not a
  dead spinner).
- **Empty + organizer** → a "Generate walkthrough tour" button.
- **Empty + member/visitor** → nothing today (candidate: a tasteful teaser/locked state — your call).

**B. Listing card — "Tour" badge.** A small quiet badge on the top corner of the card photo when a
tour exists (signals "this one has a tour"). Design the badge treatment.

Components to design: ① the tour player (ready) ② the generating state ③ the empty/CTA state
④ the card "Tour" badge.
