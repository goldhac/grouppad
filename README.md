# GroupPad

**Plan a group trip your whole group actually agrees on.** Collect rental
listings on one shared board, vote in the open, see the real **per-person**
cost, let an AI ("Scout") break the tie, and lock one official pick — without
the 200-message group chat and the 14 lost Airbnb links.

🔗 **Live:** https://exquisite-inspiration-production-7511.up.railway.app

---

## What it is

GroupPad is a web app (installable PWA, works great on mobile) for groups
deciding on **one vacation rental together**. One person starts a trip, shares a
link, and everyone lands on a single board where the homes — and the decision —
live. No accounts-up-front, no spreadsheets, no math.

## What it does

- **One shared board.** Every home the group is considering in one place:
  *Recommended* (AI-ranked), *From your group* (anything members paste in), and
  *More homes* (auto-pulled live listings).
- **Real per-person pricing.** Every home shows the all-in 5-night total **and
  exactly what each person pays**, recomputed live as people join. Set the group
  size with one tap.
- **Vote in the open.** Thumbs-up the homes you like; any home the group likes
  rises into the **Shortlist** on its own. You can also see **who's coming** and
  **who voted** for what — it's collaborative, not secret.
- **Scout, the AI guide.** Reads your itinerary, budget and must-haves, then
  ranks the board best-to-worst with a one-line "why it ranks here." Compare two
  or more finalists side-by-side for a verdict, and generate a short **AI video
  walkthrough** of a home's best spaces.
- **Paste any listing.** Drop an Airbnb / VRBO / Booking / villa link — it's
  scraped, priced all-in, deduped against the same home from other sites, and
  added for the group to weigh in on.
- **Lock the official pick.** Everyone casts one **top choice**; the leaderboard
  shows where the group stands (and who picked what); the organizer seals the
  winner with a gold lock.
- **Themes.** Six brand skins (Classic, Tropical, Coastal, Sunset, Pink Summer,
  Forest) that compose with light/dark. The organizer sets a default for the
  trip; each member can override it for themselves.
- **Invites & notifications.** Share-link invites with a celebratory welcome,
  email when someone new joins, and an instant alert when the pick is locked.

## How to use it (as a group)

1. **Start a trip** — destination, dates, guests, budget. GroupPad kicks off a
   rentals search for your dates.
2. **Invite your group** — share the link. New members land on the board and can
   browse as guests; they sign in (one-tap email link, no password) to vote.
3. **Fill the board** — keep the auto-found homes, and paste any other links.
4. **Vote & compare** — thumbs-up favorites, check the per-person cost, ask Scout
   to rank or compare, watch a walkthrough.
5. **Decide** — everyone stars a top choice; the organizer locks the official
   pick. Done.

---

## Tech stack

- **Client:** React 18 + TypeScript + Vite, Tailwind + a CSS-token design system
  (`client/src/ds2/`), HashRouter. Installable PWA (manifest + service worker).
- **Server:** Node 20 + Express (`server.js`) — a single API server that also
  serves the built client.
- **Storage:** file-based JSON under a data directory (`PIPELINE_DATA_DIR`, a
  persistent volume in production). No external DB required.
- **AI & data services:** Google **Gemini** (ranking, compare, photo selection),
  **fal.ai** (image-to-video walkthroughs), **Apify** (rental discovery scraping)
  with a **Playwright/Firecrawl** fallback for per-listing prices, **Resend**
  (transactional email).
- **Hosting:** Docker on **Railway** (multi-stage build; bundled Chromium for the
  price scraper).

## Architecture at a glance

```
client/            React + Vite app  →  built to client/dist
  src/views/         screen components (Board, Trips, Manage, Admin, mobile *)
  src/store/         AppContext — all client state + the API layer
  src/ds2/           design tokens, themes (skins), component CSS
server.js          Express API + static host + the search/AI pipeline
pipeline.js        standalone rentals-search runner (also runs in-process)
data/              per-trip JSON (listings, votes, finalvotes, members, …)
docs/              BACKLOG.md (open tickets) · INFRA_PLAN.md (infra notes)
Dockerfile         multi-stage build → lean runtime image
```

Two scraping jobs are kept separate: **discovery** (Apify actors search a
location for ~170 listings) and **per-listing price/detail** (own Chromium via
Playwright, with a Firecrawl fallback). See `docs/INFRA_PLAN.md`.

## Local development

**Prerequisites:** Node ≥ 20, npm.

```bash
# 1. install
npm install
npm run client:install

# 2. run the client (Vite dev server, hot reload)
npm run client:dev          # http://localhost:5173

# 3. run the API server (serves the built client + the API on :3000)
npm run client:build        # build the client once
npm start                   # node server.js
```

For day-to-day UI work, use the Vite dev server (`client:dev`) and point it at a
running API. For a production-like run, `client:build` then `npm start` serves
everything from `:3000`.

**Type-check / build the client:**

```bash
cd client
npm run typecheck           # tsc --noEmit
npm run build               # tsc + vite build
```

## Environment variables

The app runs with sensible defaults; set these to enable the integrations.

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default `3000`). |
| `PIPELINE_DATA_DIR` | Where per-trip JSON lives (default `./data`; a volume in prod). |
| `APP_BASE_URL` | Base URL for email/share links — **set per environment** (prod vs staging). |
| `SUPER_ADMIN_EMAILS` | Comma-separated emails granted platform-admin powers. |
| `ADMIN_KEY` | Fallback admin key when not signed in as a super-admin. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Scout AI (ranking, compare, photo picks). |
| `FAL_KEY` / `FAL_MODEL` | AI video walkthroughs (image-to-video). |
| `APIFY_TOKEN` (or `APIFY_TOKENS`) | Rental discovery scraping. |
| `FIRECRAWL_API_KEY` | Per-listing price fallback. |
| `RESEND_API_KEY` / `MAIL_FROM` | Transactional email (invites, digests, alerts). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Optional Google sign-in. |

(Email sign-in works without Google. Without the AI/scraping keys, those features
degrade gracefully rather than break.)

## Deployment

Production runs on **Railway** from the `Dockerfile` (multi-stage: server deps →
client build → lean runtime with Chromium). There are two environments:

- **production** — the live site (`APP_BASE_URL` = the prod domain).
- **staging** — an isolated copy with its own domain + data, for testing first.

Deploy from a checkout with the Railway CLI:

```bash
railway up --environment staging  --service exquisite-inspiration --detach
railway up --environment production --service exquisite-inspiration --detach
```

> The upload context is kept lean via `.railwayignore` (excludes `marketing/`,
> `node_modules`, `client/dist`, etc.) so uploads don't time out.

## Roadmap / open tickets

Tracked as GitHub Issues and in [`docs/BACKLOG.md`](docs/BACKLOG.md) — currently:
a mobile design-handoff gap audit, GitHub auto-deploy, and a member-removal
cleanup decision.

---

*Built with Claude Code.*
