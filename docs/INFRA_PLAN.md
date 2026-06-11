# GroupPad — Infra & Cost Plan (revisit later)

Decisions and triggers for scraping + AI video, so future choices are data-driven, not vibes.
Last reviewed: 2026-06-11.

---

## TODO — Spend visibility (do this; ~half a day)

The point: know when we cross a cost threshold instead of guessing.

- We already meter **Gemini** (token spend → est USD, monthly cap, `geminiGuard`) and **Apify** (counted in `bumpUsage`).
- **Add a fal.ai spend counter the same way:** every `falSubmit` / walkthrough generation logs clips × seconds × $0.045 into `bumpUsage('fal', { clips, seconds, usd })`, segmented by month like the others.
- **Surface all three (Gemini / Apify / fal) in the admin view** (`AdminView` reads `loadUsage()` / the usage meter) so monthly spend per provider is visible at a glance.
- Why it matters: this is the instrument that tells us *when* the self-host math below actually flips. Without it, the WanGP decision is a guess.

---

## Scraping pipeline

**Two distinct jobs — treat them separately.**

### A. Discovery / search — KEEP APIFY
- Apify actors (`tri_angle~new-fast-airbnb-scraper`, `makework36~vrbo-scraper`) search by location and return ~170 structured listings.
- Cost (from code notes): Airbnb fast scraper ~**$0.002/result, ~$0.34 per location-run**; VRBO ~$0.0025/result.
- ScrapeGraphAI's Search equivalent = 2–5 credits/result → **3–12× more expensive** for discovery, and it's a general web-search-and-extract, not a purpose-built Airbnb actor that survives Airbnb's bot-wall at scale.
- **Verdict: do not replace discovery with ScrapeGraphAI.**

### B. Per-listing price/detail — CANDIDATE TO REPLACE (pilot first)
- Today: the flaky `fetchPriceWithPlaywright` (own Chromium) + `fetchPriceViaFirecrawl` fallback in `server.js` (~line 869). Most fragile code path; most likely to silently show wrong/missing prices.
- **ScrapeGraphAI fits here** (single URL + schema → structured JSON, managed anti-bot, JS rendering).
  - **Hosted `scrapegraph-js` (Node SDK / REST):** drops into the Express server, no Chromium, no Python. ~5 credits/listing (~**$0.01–0.025**). Starter plan $17/mo ≈ 2,000 extractions. **Best fit for our Node stack.**
  - **OSS `scrapegraphai` (Python, MIT):** bring-your-own-key (supports Gemini, which we already use → only token cost), BUT it's Python (a sidecar) and STILL needs Playwright. Cheapest per-call, most friction. Only if we want to delete hand-written parsers and accept a 2nd service.
- **GATE: pilot before switching.** Run ScrapeGraphAI against 5–10 real Airbnb + VRBO listing URLs *at trip dates*; confirm it returns the **dated** price (not blocked, not a teaser rate). If it passes → swap in, delete Playwright price path + Firecrawl dep. If Airbnb blocks it → keep Playwright. (Pilot result appended below.)
- REST shape (v2, **verified working** — see pilot below): `POST https://v2-api.scrapegraphai.com/api/extract`, header `SGAI-APIKEY`, body `{ url, prompt, mode }`, **synchronous** (returns `{ id, json, usage }` directly). The v1 `api.scrapegraphai.com/v1/smartscraper` host is deprecated and rejects keys.

---

## AI video generation (the walkthrough)

Config today: **3 clips × 6s** per walkthrough, fal `hailuo-02 standard` @ **$0.045/sec, 768p** (`server.js` FAL_MODEL, `TOUR_MAX_CLIPS=3`, `TOUR_CLIP_SECONDS=6`).

| | fal.ai (today) | WanGP self-host (RTX 4090 ≈ $0.44/hr) |
|---|---|---|
| per 6s clip | **$0.27** | ~$0.02–0.05 GPU time *if busy* |
| per walkthrough (3 clips) | **~$0.81** | ~$0.07–0.15 busy · idle GPU = sunk cost |
| fixed monthly | $0 (pay per use) | ~**$317** always-on 4090 |
| latency | ~4 min/gen | minutes/clip (not slower than fal-standard) |
| ops | none | GPU host, drivers, ~tens-of-GB weights, queue |

- **Break-even ≈ 390 walkthroughs/month (~13/day).** Below that, fal is cheaper + zero ops.
- **WanGP self-host trigger — adopt only when ONE is true:**
  1. **>13 AI walkthroughs/day**, OR
  2. We want **one GPU box** doing walkthroughs + marketing video (Wan/LTX) + **Flux** stills — killing fal + Higgsfield + Flux fees together. This consolidation is the only thing that makes a ~$300/mo GPU pay off.
- RunPod **serverless** (pay per active GPU-second) lowers break-even but adds cold-start latency.
- Wan2GP repo: https://github.com/deepbeepmeep/Wan2GP — runs Wan 2.1/2.2, LTX, Hunyuan, Flux on 6GB+ VRAM; Gradio UI + headless CLI + API + Docker.

---

## Bottom line

1. **Pre-launch: change nothing in prod.** Ship first; don't optimize costs we're not paying.
2. **One worthwhile change:** pilot `scrapegraph-js` on real listings → swap in *only if it passes* → deletes our flakiest code + Firecrawl.
3. **Keep Apify for discovery.**
4. **Self-host video only at the trigger above.** Write the trigger down (done); build the spend meter so we know when we hit it.

---

## Pilot results — ScrapeGraphAI on real listings (RAN 2026-06-11)

**Auth gotcha first:** the docs section I started from used the **deprecated v1 host** (`api.scrapegraphai.com/v1/smartscraper` + `/v1/credits`), which rejected every key with `{"error":"Invalid API key."}` — that was a *host/version* mismatch, NOT a bad key. The live API is **v2**:
- `POST https://v2-api.scrapegraphai.com/api/extract` — body `{ url, prompt, mode }`, header `SGAI-APIKEY`. **Synchronous** (returns `{ id, json, usage, metadata }` directly — no `request_id` polling).
- Also: `/api/search`, `/api/scrape`, `/api/crawl`, `/api/monitor`, `/api/credits`.
- Cost observed: **~2–3 credits per `extract`** (Free plan = 500 credits; after 2 successful + 2 empty calls, `used:5, remaining:490`). Empty/blocked fetches **still charge**.

### Results at trip dates (Aug 18–23, 14 guests)

| Listing | Result | Returned | Stored est_5n |
|---|---|---|---|
| **Airbnb `1632886531011031555`** (7BR) | ✅ **PASS** | dated price **$3,788**, nightly $757.60, 7BR, sleeps 24, available | $5,022 |
| **VRBO `3918232`** | ❌ **FAIL** | empty `{}` — fetch returned a ~125-byte shell (bot/JS wall), both URL formats, 2 tries | $5,766 |

### Round 2 — pushed `fetch_config` (heavy JS + stealth) to "find a way"

Docs revealed a `fetch_config` object (NOT in the v1 examples): `mode` ∈ `auto|fast|js`, `stealth: true` (= "residential proxy + anti-bot headers"), `wait` (0–30000ms), `scrolls` (0–100), `country` (ISO-2), `headers`, `cookies`, `timeout`. These DO run (heavy calls cost ~10 credits vs ~2–3 normal).

**Airbnb with `mode:"js"`+`stealth`+`wait:6000`+`scrolls`:** byte-identical chunks to `normal` → still $3,788 base, fees still 0. Pulled the **raw markdown** to settle it: the page contains only the **JSON-LD listing object** (title/photos/description). **The fee breakdown is not in the DOM at all** — it lives behind Airbnb's reservation/checkout GraphQL, which no room-page scraper reaches.

**VRBO with `mode:"js"`+`stealth`+`wait:9000`+`country:us`:** STILL the **"Bot or Not?" 429** challenge page (verified via raw markdown). Stealth + residential proxy does **not** defeat Expedia's bot wall.

### The reframe that matters — checked our OWN pipeline (`server.js`)
- Airbnb is fetched **base-only** (`fetchAirbnbCalendarPrices` → `type:'nightly_only'`; comment L1707: *"nightly base rates only (no cleaning/service fees)"*).
- `est_5n` is then **computed, not scraped**: `(base + PIPELINE_CLEANING_FEE $400) × (1 + PIPELINE_TAX 0.14)` (L2242, L2351-2352). Community prices are even labeled *"base nightly rates only (excl. cleaning & service fees)"* (L2288).
- **So our "all-in" was always an estimate.** ScrapeGraphAI's $3,788 is the *same kind of base number* our pipeline already feeds into that formula. (Stored $5,022 vs a fresh `(3788+400)×1.14=$4,774` differ only by Airbnb price drift since original capture — both are base+estimate, neither is real fees.)

### FINAL VERDICT
| Source | Result | Action |
|---|---|---|
| **Airbnb** | ScrapeGraphAI returns the **identical base** our flaky Playwright/calendar path produces, feeding the **same** `+$400+14%` estimate. "Missing fees" is **not a regression** — we never scraped them. | **Clean drop-in** for the Airbnb base-price fetch. Managed anti-bot replaces maintaining our own Chromium, **zero change** to the price number. Wire behind a flag post-launch. |
| **VRBO** | Hard-blocked by Bot-or-Not even with stealth+residential proxy, twice. | **Keep Playwright/Firecrawl.** ScrapeGraphAI is not an option. |

- There is **no "real all-in fees" to unlock** — that was a mirage; the $400+14% estimate is the design, on both sides.
- Cost: ~2–3 credits/listing normal, **~10 credits with `js`+`stealth`**. Empty/blocked fetches still charge. Burned ~36 of 500 free credits across both rounds.
- Pre-launch stance unchanged: **change nothing in prod now.** Post-launch, the only worthwhile swap is Airbnb base-price → `extract` (normal mode is enough; stealth not needed for Airbnb). VRBO stays on Playwright.
