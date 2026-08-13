# Activity / things-to-do data sources beyond Airbnb Experiences

**Status:** Research, decision-ready · Created 2026-08-12 · No code written, nothing else modified.
**Companion docs:** [experiences.md](experiences.md) (the normalized row), `experiences.js` (our working
Airbnb scraper), `~/.claude/skills/web-scraping/` (tool ladder + anti-bot playbook).

## 0. How to read this

Everything marked **TESTED** was fetched live from this machine on 2026-08-12 with `curl` and the real
HTTP status / payload is quoted. Everything marked **INFERRED** comes from vendor docs or search and was
*not* exercised end-to-end (usually because it needs a key a human has to sign up for).

**The one caveat that colours the whole document:** this laptop is on a **residential IP**. Railway is a
**datacenter IP**. A 200 here is *not* proof of a 200 there — that is exactly the trap VRBO set for us.
Where I could get a second data point I did (see §6), but treat every "scrapable" verdict below as
"scrapable from a residential IP, datacenter unproven" unless it says otherwise.

---

## 1. Ranked shortlist — what to actually add next

### #1 — Viator Partner API (Affiliate "Basic" access) · **the big one**
The finding that overturns our working assumption. **The Viator *website* is DataDome-walled** (TESTED:
`https://www.viator.com/Los-Angeles/d645-ttd` → **HTTP 403** with a `geo.captcha-delivery.com` challenge
blob — the same family of wall as VRBO's PerimeterX). But **the official Partner API is a completely
separate door, and Basic access is free with no pre-authorization** (INFERRED from Viator's
partner-resources page; TESTED that the endpoint is live and key-gated: `POST
api.viator.com/partner/products/search` → `400 MISSING_HEADER_VALUE: exp-api-key`, and with a junk key →
`401 UNAUTHORIZED: Invalid API Key`).

Why it wins: I pulled the **actual OpenAPI spec** off `docs.viator.com/partner-api/technical/` (TESTED —
it is inlined in the page's `__redoc_state` blob) and the `/products/search` product summary is a
**near-exact 1:1 with our normalized row, including the two fields nobody else has** — `duration` in
real minutes and a pre-discount price. Coverage is global and enormous (Viator is the largest
tours-and-activities marketplace in the world). It sidesteps the anti-bot problem entirely because
we stop being a scraper and become a partner. Effort is **S** once someone signs up.

**Blocker: a human has to register at partnerresources.viator.com to get the `exp-api-key`.** That is
the only thing standing between us and this source. It is free and requires no approval, but I cannot do
it (account creation is off-limits to me). This is the single highest-leverage next action in this doc.

### #2 — OpenStreetMap via Overpass API · **free, unblockable, coordinates for everything**
TESTED: `POST overpass-api.de/api/interpreter` → **HTTP 200 in ~3s, no key, no UA games, no headers**.
A LA-County bounding box for `tourism=attraction|museum|viewpoint|zoo|theme_park|aquarium|gallery` plus
`leisure=park|beach|water_park|nature_reserve` returns **4,445 elements** (TESTED via `out count`).
Every element carries lat/lon, most carry `name`, many carry `website`, `opening_hours`, `fee`,
`wikidata`, `wikipedia`.

Why it wins: it is the **free-things-to-do lane Airbnb structurally cannot serve** — Airbnb only lists
things somebody sells. A group trip is beaches, parks, viewpoints and the observatory as much as it is
paid tours. It is ODbL-licensed (attribution only), it will never IP-block a datacenter, and it costs
nothing forever. It gives us coordinates for free, where Airbnb made us do a detail-fetch per row.
No price, no rating, no photo, no duration — accept that and label these rows honestly.

### #3 — Wikivoyage listings (+ Wikipedia/Wikidata for enrichment) · **editorial judgement, free**
TESTED: `en.wikivoyage.org/w/api.php?action=parse&page=Los+Angeles/Hollywood&prop=wikitext` → **HTTP 200**,
and that one district page contains **29 `{{see}}`/`{{do}}` listings**, each a structured template with
`name`, `url`, `lat`, `long`, `image` (Commons filename), `price`, `hours`, `wikidata`, and a
human-written `content` blurb. Example verbatim from the payload: `name=Hollywood Sign | lat=34.134103 |
long=-118.321694 | wikidata=Q180376`.

Why it wins: OSM has breadth but no taste — Wikivoyage is **hand-curated by travellers and says what's
worth doing**, which is what a group actually wants. It fills OSM's descriptive gap for free under
CC BY-SA 4.0. LA is split across ~8 district pages (TESTED: `list=search` returns `Los Angeles`,
`/Downtown`, `/West`, `/Eastside`, `/South`, `/Wilshire`, …), so one city is a handful of cheap fetches.
Wikipedia's `list=geosearch` + `prop=pageimages|extracts|coordinates` (both TESTED, **HTTP 200**) fills
in a real photo and a first paragraph for anything with a Wikipedia article.

### #4 — Ticketmaster Discovery API · **the "what's on while we're there" lane**
TESTED: `app.ticketmaster.com/discovery/v2/events.json` → **HTTP 401** `FailedToResolveAPIKey` (live,
key-gated). INFERRED: free tier is **5,000 calls/day, 5 req/sec**, self-serve signup by email or Google,
**no credit card**.

Why it wins: it is the only source here that answers *"is there a concert / game / show the weekend
we're in town?"* — a category Airbnb Experiences, OSM and Wikivoyage all miss completely, and one that is
genuinely date-sensitive in the way a group trip is. Effort **S** (documented REST, official free tier).

### #5 — Musement internal API · **works today, zero signup, but grey-zone**
TESTED and this one is a small gift: `api.musement.com/api/v3/*` is **wide open** — no key, no cookie,
no CSRF. It only demands a header called `x-musement-application`, and **it does not validate the
value** (TESTED: `grouppad`, `website`, `musement` and `com.musement.web` all returned identical
**HTTP 200**). `GET /api/v3/cities/116/activities?limit=50` returns **88 LA activities** with, per row:
`retail_price`, `original_retail_price`, `reviews_avg`, `reviews_number`, `cover_image_url`,
`categories[]`, `title`, `description`, `url`, `uuid`. Coordinates come from
`GET /api/v3/activities/{uuid}` → `venues[].latitude/longitude` (TESTED: 4 of 6 sampled had them).

Why it places 5th despite working right now: **88 rows for LA** is thin next to Airbnb's 40-and-growing
and Viator's thousands, `duration` is **null on all 88** (TESTED), and only **18 of 88** have a non-zero
rating. And the ToS posture is the honest problem — see §5. Take it as a **backfill for ticketed
attractions** (Universal, Getty, Warner Bros, Aquarium of the Pacific — all present), not a pillar.

---

## 2. Comparison table

Cost = what we'd actually pay. DC-IP risk = probability our Railway datacenter IP gets blocked.
Effort = S (a day), M (a few days), L (a week+ or ongoing maintenance).

| Source | Type | Cost | Fields we'd get | Anti-bot / DC-IP risk | Coverage | ToS posture | Effort |
|---|---|---|---|---|---|---|---|
| **Viator Partner API** (Basic) | Official API, free key | $0 | id, title, **price + fromPriceBeforeDiscount**, currency, rating, reviews, url, photo, **duration (minutes)**, category tags. **No lat/lng** | **None** — we're a partner, not a scraper. Website is DataDome; API is not | Global, very large | Affiliate T&Cs; outlinking is the intended use — same model as our Airbnb outlink | **S** |
| **OSM / Overpass** | Free open API | $0 | id, title, **lat/lng**, category, url (`website` tag), sometimes `fee`/hours. **No price, rating, photo, duration** | **None.** No key, no UA check | Global, 4,445 POIs in LA County alone | ODbL — free to use, **attribution required**, share-alike on derived DBs | **S** |
| **Wikivoyage listings** | Free open API | $0 | title, **lat/lng**, url, description, photo (Commons), sometimes price text. No rating/duration | **None** | Global, ~8 pages per big city | CC BY-SA 4.0 — attribution + share-alike | **M** (wikitext template parsing) |
| **Wikipedia / Wikidata** | Free open API | $0 | title, **lat/lng**, **photo**, description. No price/rating/duration | **None** | Global | CC BY-SA / CC0 (Wikidata) | **S** |
| **Ticketmaster Discovery** | Official API, free key | $0 (5k/day) | title, **date/time**, **lat/lng**, price range, url, photo, category. No rating/duration | **None** | US/CA/EU/AU strong; events only | Documented free tier, attribution required | **S** |
| **Musement** (internal API) | Undocumented internal API | $0 | id, title, **price + originalPrice**, currency, rating, reviews, url, photo, category; lat/lng via detail. **duration always null** | **Low** (see §6) | ~88/LA — thin, attractions-heavy | **Grey.** Official partner API needs a contract; this is the website's own backend | **S** |
| **Civitatis** | Scrape (JSON-LD) | $0 | title, **price + currency**, rating (**/10 scale**), reviews, url, photo, description. No lat/lng, no duration | **Medium.** Header-sniffs (see §6) | 59 LA activities; strongest in Spain/LatAm | Grey — standard scrape | **M** |
| **Eventbrite** (internal search) | Undocumented internal API | $0 | title, **date**, **lat/lng**, min ticket price, url, photo, tags. No rating/duration | **Medium.** Needs CSRF + cookie | Huge (10,000 LA events reported) | **Grey**, and the *official* search API is dead | **M** |
| GetYourGuide | Blocked / gated API | — | — | **Blocked.** 403 on pages *and* robots.txt | Global, large | Partner API needs approval | **L** |
| Klook | Blocked | — | — | **Blocked.** DataDome | Asia-strong | — | **L** |
| Viator *website* | Blocked | — | — | **Blocked.** DataDome | — | — | **L** |
| Atlas Obscura | Blocked | — | — | **Blocked.** Cloudflare | Global, curated, quirky | — | **L** |
| Tiqets | Official API, free token | $0 | content, availability, pricing | None (API) | Europe-heavy | Free Distributor API token; **needs affiliate account** | **M** |
| Yelp Fusion | Paid API | **$7.99+/1k calls** | rating, reviews, photo, lat/lng | None | Huge (US) | **Free tier ended** — 30-day trial only | — |
| Google Places | Paid API | Free tier then $ + **card on file** | everything except price/duration | None | Best in class | Commercial licence, **caching restrictions** | — |
| Foursquare Places | Paid-ish | $200/mo credit, **card for overage** | lat/lng, category; **ratings are Premium, no free tier** | None | Large | Commercial | — |
| Meetup | Scrape (Apollo state) | $0 | title, date, group | Medium | Global but hobbyist | Grey | **M** |
| TimeOut | Scrape (HTML only) | $0 | title, url, editorial text | Low (200 for us) | Major cities | Grey; editorial copyright | **L** |
| NPS API | Official API, free key | $0 | park info, photos, lat/lng, activities | None | **US national parks only** | Public domain (US Gov) | **S** |
| Recreation.gov / RIDB | Official API, free key | $0 | federal rec facilities, lat/lng | None | US federal land only | Public domain | **S** |
| City open-data portals | Free (Socrata etc.) | $0 | varies wildly per city | None | **Per-city, no consistency** | Usually public domain | **L** (per city) |

---

## 3. Integration sketch — the top picks

### 3.1 Viator Partner API → our normalized row

Endpoint (from the live v2 spec, server `https://api.viator.com/partner`):

```
POST https://api.viator.com/partner/products/search
  exp-api-key: <free affiliate key>
  Accept: application/json;version=2.0
  Accept-Language: en-US
  { "filtering": { "destination": "645" },        // 645 = Los Angeles
    "pagination": { "start": 1, "count": 50 },
    "currency": "USD" }
```

Destination ids come from `GET /partner/destinations` (a taxonomy call you fetch once and cache;
this is how we'd resolve any trip's location string → a Viator destination id, replacing our
`experiencesSearchSlug()` guesswork with a real lookup).

Field mapping — this is why it's #1:

| Our field | Viator JSON path | Notes |
|---|---|---|
| `id` | `products[].productCode` | stable alphanumeric |
| `title` | `products[].title` | |
| `category` | `products[].tags[]` | numeric ids → resolve via `GET /products/tags`, cache |
| `price` | `products[].pricing.summary.fromPrice` | per-person "from" price, same semantics as Airbnb's "From $X" |
| `currency` | `products[].pricing.currency` | request `"currency":"USD"` |
| `originalPrice` | `products[].pricing.summary.fromPriceBeforeDiscount` | **equal to `fromPrice` when not discounted** — so normalize to `null` when equal, matching what `parseOriginalPrice` does today |
| `priceUnit` | *(constant `'guest'`)* | Viator "from" prices are per-person; there is no per-group flag. Hardcode `'guest'` |
| `rating` | `products[].reviews.combinedAverageRating` | 1–5, same scale as Airbnb — no conversion |
| `reviews` | `products[].reviews.totalReviews` | |
| `url` | `products[].productUrl` | already the affiliate-attributable link |
| `photo` | `products[].images[]` → pick `isCover:true`, then `variants[]` nearest our card width | variants carry `width`/`height`/`url`, so we can request a sane size instead of Airbnb's full-res problem |
| `duration` | `products[].duration.fixedDurationInMinutes` | fall back to `variableDurationFromMinutes`; both are already **minutes**, which is exactly what `mapExperienceNode` emits |
| `lat` / `lng` | **MISSING** | see below |

**What's missing and how we fill it.** `destinations[]` is destination-level (city), not a meeting point,
so Viator gives us no per-product coordinates. Three options, cheapest first:
1. **Leave `lat`/`lng` null and let `expAnchor()` degrade**, which it already does — per experiences.md §5
   the client falls back to the trip's primary ref point and says "X mi from downtown LA" rather than
   faking precision. **This is the honest default and costs nothing.**
2. Attraction-linked products can be resolved through `/attractions/search` → `/attraction`, which is
   place-shaped and more likely to carry a point. Worth a probe once we have a key.
3. Geocode `title` + city as a last resort — but that is exactly the "faking home-level precision" the
   spec already warns against. Don't.

**Rate limits / catalog:** the spec also exposes `/products/modified-since` and `/products/bulk`, i.e.
Viator *expects* partners to ingest and cache incrementally. That fits our per-trip
`experiences.json` + 24h staleness model without modification. Confirm the exact QPS in the partner
portal after signup — I could not test it without a key.

### 3.2 Overpass → our normalized row (the free-things lane)

```
POST https://overpass-api.de/api/interpreter
  data=[out:json][timeout:30];
  ( nwr["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|aquarium|gallery)$"](bbox);
    nwr["leisure"~"^(park|beach_resort|water_park|nature_reserve)$"](bbox); );
  out center 200;
```

`out center` is the important flag: it gives ways and relations (parks, beaches — most of the good stuff
is not a node) a single representative lat/lon, so every row is point-shaped like our schema wants.

| Our field | Overpass path | Notes |
|---|---|---|
| `id` | `` `osm:${type}/${id}` `` | namespace it so it can never collide with an Airbnb numeric id |
| `title` | `tags.name` | **drop the element if absent** — an unnamed viewpoint is noise |
| `category` | `tags.tourism` / `tags.leisure` | map to our existing `EXP_VIBES` buckets (museum/gallery→culture, beach/park→outdoors, viewpoint→outdoors) |
| `price` | `0` when `tags.fee=no`, else `null` | **and this is the point** — a "Free" badge is a genuinely new thing on that board |
| `priceUnit` | `'guest'` | |
| `rating`/`reviews`/`originalPrice`/`duration` | `null` | permanently. The card must not look broken without them |
| `url` | `tags.website` \|\| `https://www.openstreetmap.org/{type}/{id}` | |
| `photo` | **MISSING** → enrich | `tags.wikidata` → Wikidata `P18`, or `tags.wikipedia` → the Wikipedia `pageimages` call I tested. Where neither exists, a category placeholder |
| `lat`/`lng` | `lat`/`lon`, or `center.lat`/`center.lon` | **free, no per-row detail fetch** — strictly better than the Airbnb path |

Bounding box from the trip's ref points (`ref_points` is already exposed on `tripView` per
experiences.md §5), padded ~0.3°. One request per trip, cached — Overpass asks that you not hammer it.

**Attribution is mandatory:** the response itself carries the ODbL notice. A "© OpenStreetMap
contributors" line under the section satisfies it.

---

## 4. What to avoid, and why — bluntly

- **GetYourGuide — don't.** TESTED: `https://www.getyourguide.com/los-angeles-l78/` → **HTTP 403**, and
  **their `robots.txt` itself returns a 403 error page**, which is about as clear a "no" as a server can
  give. Full browser headers didn't help (403 again, connection reset). A datacenter fetch from
  Anthropic's infra was also **403**. Their Partner API exists but requires contacting them and being
  approved. **Verdict: closed unless a human negotiates access. Do not spend engineering time.**
- **Klook — don't.** TESTED: **HTTP 403** serving a DataDome challenge (`geo.captcha-delivery.com`,
  `dd={...}` blob). Per our own anti-bot ladder that is Rung 4 territory — residential proxies + real JS
  — for an Asia-focused catalogue we barely need. Not worth it.
- **The Viator *website* — don't.** Same DataDome wall (TESTED). But note the crucial distinction: this
  is an argument against **scraping viator.com**, not against **Viator**. The API is the way in, and the
  original assumption in the brief ("assume Viator may be hostile") is **half right** — hostile to
  scrapers, open to partners.
- **Atlas Obscura — don't.** TESTED: **HTTP 403**, Cloudflare "Attention Required" interstitial. Great
  content, closed door, and their editorial text is copyrighted anyway.
- **Yelp Fusion — no longer free.** The free tier ended; it's a 30-day trial then ~$7.99/1k calls. Off
  the table for a $0 pipeline.
- **Google Places — technically possible, practically wrong for us.** The universal $200 credit was
  retired in March 2025 in favour of per-SKU free tiers (~5,000 Pro calls/month). It still requires a
  **billing account with a card on file**, and its caching restrictions conflict with our
  write-a-JSON-file-and-serve-it model. It also has no price and no duration, so it wouldn't even fill
  the fields we're short on.
- **Foursquare — the free tier doesn't include what we want.** Ratings, photos, tips and hours are
  **Premium endpoints with no free allowance**. The free credit buys us places-without-ratings, which OSM
  gives us for actually-free.
- **Eventbrite's official API — dead for our purpose.** TESTED: `GET
  eventbriteapi.com/v3/events/search/` → **HTTP 404 NOT_FOUND**. The public search endpoint is gone; the
  v3 API now only reads your own organization's events. Their *internal* endpoint does work (TESTED:
  `POST /api/v3/destination/search/` with a scraped CSRF token + cookie → **HTTP 200**, 20 events per
  page, `object_count: 10000` for LA, 20/20 with venue lat/lng, 19/20 with a minimum ticket price) — but
  it is undocumented, CSRF-gated, and they deliberately removed the public version of exactly this
  capability. Reading that as an invitation would be dishonest. **If we want events, use Ticketmaster's
  actual free API instead.**
- **TimeOut — no structured data.** TESTED: **HTTP 200**, but the only JSON-LD on the page is a `WebPage`
  publisher stub. Extracting the list means brittle CSS-selector scraping of editorial prose we'd have no
  right to reproduce. Skip.
- **Meetup — works but wrong audience.** TESTED: **HTTP 200** with a parseable `__NEXT_DATA__` /
  `__APOLLO_STATE__` blob containing recommended events. It's hobbyist meetups for locals, not things a
  visiting group of 14 wants. Low value regardless of feasibility.
- **City open-data portals — a trap at our stage.** TESTED that `data.lacity.org`'s Socrata catalog API
  returns **HTTP 200**, but the results for "recreation" included **Austin's** parks department — these
  portals are federated, inconsistently named, and every city needs bespoke work. **L effort per city,
  for data OSM already has.** Revisit only if we ever go deep on one city.
- **NPS / RIDB — right idea, wrong geography for us.** Both free, both key-gated (TESTED: NPS → **403
  API_KEY_MISSING**, RIDB → **401 Unauthorized**), both public-domain. But they cover **US national parks
  and federal recreation land only**. For an LA trip that's Santa Monica Mountains NRA and not much else.
  Add them later if trips skew outdoorsy; they're cheap. Not a priority now.

---

## 5. Licensing / ToS in plain terms

- **Viator (Basic affiliate):** you're a partner. Displaying products and outlinking is *the intended
  use case* — it's how they make money and how you'd make commission. This is the cleanest posture of
  anything here and matches what GroupPad already does with Airbnb (outlink, no booking).
- **OSM (ODbL):** use it for anything, commercially, forever. **Must** credit "© OpenStreetMap
  contributors." Share-alike bites only if we publish a derived *database*; showing rows in an app
  doesn't trigger it.
- **Wikivoyage / Wikipedia (CC BY-SA 4.0), Wikidata (CC0):** attribution + share-alike on the text.
  If we show a Wikivoyage blurb verbatim, credit it and link back. Wikidata facts are unencumbered.
  Both ask for a descriptive `User-Agent` with contact info — cheap to comply with, and I used one.
- **Ticketmaster:** documented free tier with an attribution requirement. Fine.
- **Musement — be honest with ourselves.** The `api.musement.com/api/v3` endpoints are the **website's
  own backend**, not the partner API. Musement's *official* partner API requires contacting
  `business@musement.com` and signing a contract. So using the open one is the same category of act as
  our Airbnb deferred-state scrape: publicly reachable, no authentication circumvented, no rate abuse —
  but not a blessed integration, and it can be closed the day they add a real check on that header. Their
  affiliate terms also restrict use of the Musement/TUI **branding**, which matters if we badge rows
  "via Musement". **My read: acceptable as a low-volume backfill with caching and polite pacing, exactly
  as we treat Airbnb — but do not build a pillar on it, and don't put their logo on it.**
- **Civitatis / Eventbrite-internal:** same grey zone, weaker justification (Eventbrite specifically
  *removed* the public equivalent). Prefer the licensed options.

---

## 6. The datacenter-IP question — what I could and couldn't prove

This is the thing that killed VRBO, so it deserves its own section rather than a column.

**What I tested from a residential IP** is in the table. **What I could partially test from a datacenter
IP:** the `WebFetch` tool runs on Anthropic's cloud infrastructure, so I used it as a crude second
vantage point:

| Target | Residential (curl) | Datacenter (WebFetch) | Reading |
|---|---|---|---|
| `api.musement.com/api/v3/...` | 200 (with header) / **400 missing-header** (without) | **400** | The datacenter request **reached the application** and got the same app-level header error, not a network-level block. Weak-but-real evidence Musement does **not** IP-filter |
| `partner.getyourguide.support/...` | 403 | **403** | Blocked from both. Consistent |

**Not proven, and worth a 10-minute smoke test before committing:**
- **Musement from Railway specifically.** The 400-vs-403 signal above is suggestive, not conclusive.
- **Civitatis from Railway.** It's the most fragile of the plausible options: it returned **HTTP 406**
  to a bare `curl` and only **HTTP 200** once I sent a full browser header set including `Accept`,
  `Accept-Language` and `sec-fetch-*`. That is deliberate header sniffing, which usually travels with IP
  reputation checks. Assume it may fail on Railway.
- **Overpass / Wikimedia / Ticketmaster / Viator API:** these are the ones I'd bet real money on. Open
  infrastructure and official APIs don't care where you call from. Wikimedia asks only for a polite
  `User-Agent`; Overpass asks only that you don't hammer it.

**Recommended cheap verification** before writing any integration: run the same three `curl`s from a
Railway shell (Overpass, Musement, Viator-with-key) and compare status codes to the ones quoted here.
That is the discipline the site-playbook calls for and the one we skipped on VRBO.

---

## 7. Blending sources — dedupe and provenance

Our rows currently assume one Airbnb-shaped source. Three things have to change before a second source
lands, and they're all cheap if done *before* the first extra source ships, expensive after.

### 7.1 Namespace the id, add a `source`
`id` is currently a bare Airbnb trip-template id (`"3951041"`) and is the key for **`exp-votes.json`,
`exp-saves.json`, `exp-days.json`, `exp-reviews.json` and `exp-myplans.json`**. A second source
introducing its own numeric ids would silently collide with all five stores — someone's vote for a
Viator tour landing on an Airbnb experience. Namespace **before** the second source exists:

```
id: "airbnb:3951041" | "viator:5010SYDNEY" | "osm:way/12345" | "musement:12eee316-..."
source: 'airbnb' | 'viator' | 'osm' | 'wikivoyage' | 'ticketmaster' | 'musement'
sourceLabel: 'Airbnb' | 'Viator' | 'OpenStreetMap' | ...   // for the UI badge + attribution
```

**Migration matters:** existing per-trip vote/save/day files hold bare ids. Either write a one-time
key migration (`"3951041"` → `"airbnb:3951041"`) in the runner, or have the reader treat an unprefixed
key as `airbnb:`. The runner already has precedent for carrying engagement forward across refreshes (the
`retained: true` logic in `scripts/run-experiences.js`) — this belongs in the same place.

### 7.2 Dedupe across providers
The same Warner Bros. Studio Tour is on Airbnb, Viator, Musement and Civitatis, and Griffith Observatory
is in OSM, Wikivoyage *and* Wikipedia. Overlap is guaranteed. A pragmatic ladder, cheapest signal first:

1. **Exact external-id match.** OSM ↔ Wikivoyage ↔ Wikipedia all carry `wikidata` Q-ids — that's a free,
   exact join across our three open sources. Use it first; it removes most open-source duplication.
2. **Geo + name fuzzy match.** Where both rows have coordinates: **within ~150m AND** normalized-title
   token overlap ≥ ~0.6 (lowercase, strip punctuation and stop-words like "tour", "tickets",
   "skip-the-line", "guided"). Titles differ a lot across marketplaces, so name alone is not enough and
   distance alone is not either — a museum and its café are 20m apart.
3. **Name-only fallback** for rows with no coordinates (Viator, Civitatis): require a high threshold
   (≥0.8) *and* the same city, and accept that some duplicates survive. Better a rare duplicate than a
   wrongly-merged row that sends the group to the wrong place.

**Which copy wins.** Don't merge fields — **pick one row and keep the others as alternates.** Merging
prices across marketplaces produces a number that is true nowhere. Suggested precedence:
`airbnb > viator > musement > civitatis` for *sold* activities (richest fields, and Airbnb is the
source the group already trusts on this board), and `wikivoyage > osm` for *free* places (Wikivoyage has
the description and the editorial judgement; OSM has the completeness). Keep the losers in an
`alternates: [{source, url, price}]` array — that quietly enables "also on Viator for $12 less", which
is a real feature hiding in this work.

**Dedupe at write time, in the runner, not in the client.** The client already renders from one array
and the leaderboard/Scout/plan code all key off `id`; doing it downstream would mean four surfaces
disagreeing about what counts as one thing.

### 7.3 Label provenance honestly in the UI
- **A small source chip on each card** ("Airbnb", "Viator", "OpenStreetMap"). Not decoration — ODbL and
  CC BY-SA make attribution a **licence condition**, and the outlink destination genuinely differs.
- **A "Free" badge** where `price === 0`, which is the visible payoff of adding OSM/Wikivoyage and the
  clearest reason this work is worth doing.
- **Null-tolerant cards.** Today's card assumes price + rating + duration are usually present. An OSM
  row has *none* of them. The card must render a title, photo and category cleanly and simply omit the
  missing chips — not show "—" or a zero. This is the single biggest UI change the blend requires, and
  it interacts with the known `.card .badge-row` `space-between` / no-`flex-wrap` issue already logged in
  experiences.md §4c item 5.
- **Sorting must degrade.** Default sort is net votes → rating (Phase 1.7). Sourceless-rating rows would
  sink to the bottom forever. Sort unrated rows by a neutral band rather than treating `null` as 0, or
  free/OSM items will never be seen.
- **Attribution footer** on the Things-to-do tab and — importantly — on the **public share page and the
  PDF**, since those are redistribution and that's where the licence actually binds.

---

## 8. Recommended sequence

1. **A human signs up for a free Viator affiliate key** (partnerresources.viator.com, no approval
   needed). This unblocks the highest-value source and nothing else in this doc can substitute for it.
2. **While waiting: do §7.1** — namespace ids and add `source`/`sourceLabel`, with the vote/save/day key
   migration. It's the cheapest it will ever be right now, with exactly one source in the wild.
3. **Ship OSM + Wikivoyage as the "free things to do" lane.** Zero cost, zero block risk, zero signup,
   and it adds a category Airbnb structurally cannot cover. Also the safest place to prove the
   null-tolerant card and the provenance chip against a source that is *missing* most fields.
4. **Add Viator** once the key lands — near-drop-in mapping, and it's the first source that gives us
   `duration` and `originalPrice` without a scrape.
5. **Ticketmaster** if dated events prove interesting (free key, S effort).
6. **Musement** only as attraction backfill, with the ToS caveat in §5 understood.
7. **Re-run the Railway smoke test in §6** before shipping anything that isn't an official API.

---

# ✅ VERIFIED FROM RAILWAY PRODUCTION (2026-08-11)

The earlier findings were probed from a laptop on a **residential** IP, which proves
nothing about our deploy — the exact assumption that burned us on VRBO. These results
come from **inside the running production container** (`railway ssh`), egress IP
**`152.55.180.52`** (Railway datacenter). This is the number that matters.

| Source | Status from Railway | Verdict |
|---|---|---|
| **Airbnb Experiences** (control) | **200** · 745 KB · 458ms | ✅ our existing scraper is unaffected |
| **Wikivoyage API** | **200** · 47 KB · 118ms | ✅ works; `list=geosearch` also 200 (5 places near DTLA) |
| **Wikidata** | **200** · 96ms | ✅ works |
| **OSM Overpass** — `overpass-api.de` | **504** (gateway timeout, 8.8s) | ⚠️ public instance overloaded, NOT an IP block |
| **OSM Overpass** — `overpass.kumi.systems` | **200** · 5.8s · returned 5 POIs | ✅ **use this mirror**, with fallback across mirrors |
| **Musement API** | **200** · 15 KB · 538ms | ✅ reachable (unvalidated `x-musement-application` header) — but grey ToS |
| **Ticketmaster Discovery** | **401** (no key sent) | ✅ reachable — 401 is auth, not a block. Free key works |
| **Viator Partner API** | **400** (no key/body sent) | ✅ **reachable — the application answered.** Free key required |
| **NPS API** | **403** (no key sent) | ✅ reachable, needs free key |
| Viator **website** | **403** · DataDome CAPTCHA | ❌ blocked |
| GetYourGuide | **403** · Cloudflare | ❌ blocked |
| Klook | **403** · DataDome CAPTCHA | ❌ blocked |
| Atlas Obscura | **403** · Cloudflare | ❌ blocked |

## What this changes

1. **The clean split is confirmed: official APIs are reachable from our datacenter IP;
   scraped marketplaces are uniformly walled.** Every commercial activity marketplace we
   tried (Viator's site, GetYourGuide, Klook) blocks us, while every API door (Viator
   Partner, Ticketmaster, NPS) answered. Airbnb remains the exception that scrapes fine.
2. **Overpass needs mirror fallback, not a proxy.** The main instance 504s under load;
   `overpass.kumi.systems` served the same query in 5.8s. Any integration must try
   several mirrors in order rather than trusting `overpass-api.de`. Also note Overpass
   returns **406** for a browser-like User-Agent — send a descriptive app UA and POST
   the query as the body.
3. **Latency is real**: Overpass ~6s vs Airbnb ~0.5s. OSM enrichment belongs in the
   background runner, never in a request path.
4. **Nothing here needs a proxy or residential IP** — which was the open risk. The free
   lane (OSM + Wikivoyage + Wikidata) is fully available to us today at zero cost.

## Method note
`railway ssh --service exquisite-inspiration --environment production "node /tmp/probe.js"`,
20–25s timeouts, real `fetch` from the container. Response bodies were sniffed for
DataDome / PerimeterX / Cloudflare signatures rather than trusting the status alone.

---

# Where to actually register (verified 2026-08-13)

The docs sites are not the sign-up doors. These are:

| Source | Registration URL | Notes |
|---|---|---|
| **Viator Partner API** | `https://partners.viator.com/signup` | Viator **Partner Program** signup (Tripadvisor SSO — an existing Tripadvisor account works). Reached from `partnerresources.viator.com/travel-commerce/affiliate/` → "Become a partner". `viator.com/partner/signup` just redirects to the consumer homepage; `docs.viator.com` is documentation only. After signup the **Affiliate API** tier issues the free `exp-api-key` for `api.viator.com/partner/`. |
| **Ticketmaster Discovery API** | `https://developer-account.ticketmaster.com/user/register` | Free key, instant. `developer.ticketmaster.com/products-and-docs/…` is docs only. The form needs Terms-of-Use consent + a reCAPTCHA, so it has to be completed by a human. |
| **NPS API** | `https://www.nps.gov/subjects/developer/get-started.htm` | Free key by email, no account. |

Both Viator and Ticketmaster gate on account creation, terms acceptance and a CAPTCHA —
the key has to be obtained by the account owner, not automated. Once issued, set
`VIATOR_API_KEY` / `TICKETMASTER_API_KEY` in Railway and wire them as sources 3 and 4
alongside `airbnb:` and `osm:` (ids namespaced, see experiences.md §4d).
