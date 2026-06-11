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
- REST shape: `POST https://api.scrapegraphai.com/v1/smartscraper`, header `SGAI-APIKEY`, body `{ website_url, user_prompt, output_schema? }`, async (returns `request_id` + `status`, poll for `result`).

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

## Pilot results — ScrapeGraphAI on real listings

**2026-06-11 — blocked on auth, not yet run.** Hit `POST /v1/smartscraper` (and `/v1/credits`) with the provided key against the real Airbnb `1632886531011031555` and VRBO `3918232` URLs at trip dates. Every call returned `{"error":"Invalid API key."}`.

Diagnosis: the **auth mechanism is correct** — sending `Authorization: Bearer` returned `"SGAI-APIKEY missing."`, confirming the API reads the `SGAI-APIKEY` header we used; the specific key was simply rejected by the credits endpoint too, so it's the key, not the request shape.

Next step to actually run the pilot:
- Re-check / regenerate the key in the ScrapeGraphAI dashboard (verify the account/email is confirmed and the key is active), then re-run the test script (submits both URLs, polls `request_id` for the dated price, compares to stored est_5n of $5,022 / $5,766).
- Pass/fail bar: returns a real **dated** total for the trip window (not blocked, not a teaser nightly rate) on Airbnb specifically. If yes → swap in for the Playwright/Firecrawl path. If Airbnb blocks → keep Playwright.
