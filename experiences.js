// ─────────────────────────────────────────────────────────────────────────────
// experiences.js — FREE, self-hosted Airbnb *Experiences* discovery.
//
// Mirrors the homes self-host scraper in pipeline.js (airbnbSelfHostSearch): drives
// our own headless Chromium (playwright-core) against Airbnb's PUBLIC experiences
// search, reads the embedded results JSON off the page, paginates a page or two.
// No paid API, no key — works from any IP.
//
// The homes and experiences pages share the SAME embedded-JSON mechanism
// (a `<script type="application/json">` deferred-state blob that contains a
// `searchResults` array next to `paginationInfo`), but the *node shape* differs:
// homes nodes are StaySearchResult, experiences nodes are ExperienceSearchResult
// (an activity / trip-template, not a stay). See mapExperienceNode below.
//
// Env (same knobs as pipeline.js):
//   CHROMIUM_PATH                  — Chromium executable (Dockerfile sets /usr/bin/chromium)
//   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD — set by Dockerfile; we never auto-download
//
// Dev CLI:  node experiences.js "Los Angeles County"
//           node experiences.js "Los Angeles" 2026-08-14 2026-08-16 4
// ─────────────────────────────────────────────────────────────────────────────

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

// ── small helpers (kept local so this module has no coupling to pipeline.js) ──

function experiencesSearchSlug(loc) {
  return encodeURIComponent(String(loc).trim().replace(/\s+/g, '-'));
}

// "From $65, per guest" / "From $64, per guest, previously, $79" → 65 (the current rate)
function parseExperiencePrice(str) {
  if (!str) return null;
  const m = String(str).match(/\$([\d,]+(?:\.\d{1,2})?)/);   // first $ amount = current "From" price
  return m ? Math.round(parseFloat(m[1].replace(/,/g, ''))) : null;
}

// "…, previously, $79" → 79. The pre-discount rate; null when not on sale.
function parseOriginalPrice(str) {
  if (!str) return null;
  const m = String(str).match(/previously,?\s*\$([\d,]+(?:\.\d{1,2})?)/i);
  return m ? Math.round(parseFloat(m[1].replace(/,/g, ''))) : null;
}

// "per guest" vs "per group" — group-priced experiences change the per-person
// math entirely for a large trip (a $700/group boat ÷ 14 beats $65/guest).
function parsePriceUnit(str) {
  if (!str) return null;
  const s = String(str).toLowerCase();
  if (/per\s+group|\/\s*group/.test(s)) return 'group';
  if (/per\s+guest|\/\s*guest|per\s+person/.test(s)) return 'guest';
  return null;
}

// Currency symbol → ISO code (search is forced to USD; kept general for later locales).
function currencyFromLabel(str) {
  if (!str) return null;
  if (str.includes('$')) return 'USD';
  if (str.includes('€')) return 'EUR';
  if (str.includes('£')) return 'GBP';
  return null;
}

// Walk the parsed deferred-state JSON for the node that co-locates a `searchResults`
// array with `paginationInfo` — identical strategy to pipeline.js extractAirbnbResults,
// except experiences paginate via a single `nextPageCursor` token (not pageCursors[]).
function extractExperienceResults(deferred) {
  let out = { results: [], nextCursor: null };
  const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object' || out.results.length) return;
    if (seen.has(o)) return; seen.add(o);
    if (Array.isArray(o.searchResults) && o.paginationInfo) {
      out = { results: o.searchResults, nextCursor: o.paginationInfo.nextPageCursor || null };
      return;
    }
    for (const k in o) walk(o[k]);
  };
  walk(deferred);
  return out;
}

// Map one ExperienceSearchResult node → the normalized experience shape.
// null for anything not present; never throws on a missing field.
function mapExperienceNode(r) {
  // The search node already carries the PLAIN trip-template id (r.id === "3951041").
  // r.listing.id is the base64 "ExploreActivityListing:3951041" analog of the homes
  // demandStayListing.id — decode it only as a fallback.
  let id = r.id || null;
  if (!id && r.listing && r.listing.id) {
    try { id = (Buffer.from(r.listing.id, 'base64').toString('utf8').split(':')[1] || '').trim() || null; } catch {}
  }
  if (!id) return null;

  const listing = r.listing || {};
  const descs   = listing.descriptions || {};
  const title =
    descs.name?.localizedValue?.localizedStringWithTranslationPreference || null;

  // MEASURED (2026-08-13, from the Railway container): when the search carries
  // checkin/checkout, Airbnb serves a DIFFERENT result surface — 24 cards a page
  // instead of 20 — on which `primaryThemeFormatted` is present but always null,
  // and the theme appears nowhere else in the node. Undated searches still fill
  // it. searchExperiences() therefore backfills from a second, undated pass;
  // this stays as-is so an undated caller keeps working.
  const category = r.primaryThemeFormatted || null;   // "Water sports", "Food tours"…

  // The provider's own one-liner. It survives on BOTH surfaces, and a real
  // description always beats one Scout had to invent (see scout.md §2e).
  const byline = descs.byline?.localizedValue?.localizedStringWithTranslationPreference || null;

  const priceLabel = r.displayPrice?.primaryLine?.accessibilityLabel || null;   // "From $65, per guest[, previously, $79]"
  const price    = parseExperiencePrice(priceLabel);
  const currency = currencyFromLabel(priceLabel);
  // Discount: prefer the structured field ("$79"), fall back to the label text.
  const structuredOrig = parseExperiencePrice(r.displayPrice?.primaryLine?.originalPrice || null);
  const originalPrice  = structuredOrig ?? parseOriginalPrice(priceLabel);
  const priceUnit      = parsePriceUnit(priceLabel);

  const stats   = listing.listingRatingStats?.overallRatingStats || {};
  const rating  = typeof stats.ratingAverage === 'number' ? stats.ratingAverage : null;
  const reviews = stats.ratingCount != null ? parseInt(String(stats.ratingCount).replace(/,/g, ''), 10) : null;

  // Duration lives on the first published offering (minutes).
  let duration = null;
  const edge = listing.offerings?.publishedOfferings?.edges?.[0]?.node;
  if (edge && typeof edge.durationMinutes === 'number') duration = edge.durationMinutes;

  const photo = r.picture?.poster
             || (Array.isArray(r.posterPictures) && r.posterPictures[0]?.poster)
             || null;

  // NOTE: the experiences search node carries NO coordinates (only the free-text
  // activityLocation, e.g. "Marina del Rey"). lat/lng stay null here — call
  // enrichExperiencesWithCoords() below to fill them from the detail pages.
  // Ids are NAMESPACED (`airbnb:3951041`). They key five separate stores
  // (votes/saves/days/reviews/my-plans), so a second provider's numeric ids would
  // otherwise collide and land someone's vote on the wrong activity.
  return {
    id:       `airbnb:${id}`,
    description: byline ? String(byline).trim().slice(0, 400) : null,
    source:   'airbnb',
    title,
    category,
    price,
    currency,
    // Pre-discount rate when the experience is on sale (else null), and whether
    // the price is per guest or per whole group — the UI shows the discount and
    // computes per-person cost from the group rate.
    originalPrice,
    priceUnit,
    rating,
    reviews: Number.isFinite(reviews) ? reviews : null,
    url:      `https://www.airbnb.com/experiences/${id}`,
    photo,
    lat:      null,
    lng:      null,
    duration,
  };
}

// ── Self-hosted experiences search ──────────────────────────────────────────
// Drives our own Chromium against Airbnb's public experiences search for ONE
// location, reads the embedded results JSON, paginates up to maxItems (cheap: a
// page or two). Returns an array of NORMALIZED objects. 0 results is a SOFT
// failure — logs a warning and returns [], never throws.
async function searchExperiences({ location, checkin, checkout, adults = 2, maxItems = 40 } = {}) {
  if (!location) { console.warn('[experiences] no location given — returning []'); return []; }
  const { chromium } = require('playwright-core');
  const seen = new Set();
  const out = [];
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1400, height: 900 },
    });
    const page = await ctx.newPage();
    const maxPages = Math.max(1, Math.ceil(maxItems / 18));   // ~18-21 cards/page
    const dateQs = (checkin && checkout) ? `&checkin=${checkin}&checkout=${checkout}` : '';
    const base = `https://www.airbnb.com/s/${experiencesSearchSlug(location)}/experiences?adults=${adults}&currency=USD&locale=en-US${dateQs}`;
    let cursor = null;
    for (let p = 0; p < maxPages; p++) {
      // experiences paginate off a single opaque nextPageCursor token (base64 offset)
      if (p > 0 && !cursor) break;
      const url = p === 0 ? base : `${base}&cursor=${encodeURIComponent(cursor)}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await page.waitForTimeout(2500);
        const deferred = await page.evaluate(() => {
          for (const s of document.querySelectorAll('script[type="application/json"]')) {
            const t = s.textContent || '';
            if (t.includes('searchResults') && t.includes('paginationInfo')) {
              try { return JSON.parse(t); } catch { return null; }
            }
          }
          return null;
        });
        if (!deferred) { console.log(`  ${location} page ${p + 1}: no data blob — stopping`); break; }
        const { results, nextCursor } = extractExperienceResults(deferred);
        cursor = nextCursor;
        let added = 0;
        for (const r of results) {
          if (r.__typename && r.__typename !== 'ExperienceSearchResult') continue;   // skip HeaderInsert etc.
          const node = mapExperienceNode(r);
          if (node && !seen.has(node.id)) { seen.add(node.id); out.push(node); added++; }
        }
        console.log(`  ${location} page ${p + 1}: +${added} (total ${out.length})`);
        if (!results.length || out.length >= maxItems) break;
        await page.waitForTimeout(700 + Math.floor(Math.random() * 700)); // polite jitter
      } catch (e) {
        console.error(`  ${location} page ${p + 1} failed: ${e.message.slice(0, 90)}`);
        break;
      }
    }
    // ── Category backfill ────────────────────────────────────────────────────
    // A dated search returns no themes (see mapExperienceNode). Rather than drop
    // the date filter — which is what makes the list actually bookable for the
    // trip — take one extra undated page and join on id. One request, and the
    // vibe chips / card metadata / Scout descriptions all depend on it.
    if (dateQs && out.some((x) => !x.category)) {
      try {
        const themeUrl = `https://www.airbnb.com/s/${experiencesSearchSlug(location)}/experiences?adults=${adults}&currency=USD&locale=en-US`;
        await page.goto(themeUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await page.waitForTimeout(2200);
        const blob = await page.evaluate(() => {
          for (const s of document.querySelectorAll('script[type="application/json"]')) {
            const t = s.textContent || '';
            if (t.includes('searchResults') && t.includes('paginationInfo')) {
              try { return JSON.parse(t); } catch { return null; }
            }
          }
          return null;
        });
        if (blob) {
          const theme = new Map();
          for (const r of extractExperienceResults(blob).results || []) {
            if (r && r.id && r.primaryThemeFormatted) theme.set(`airbnb:${r.id}`, r.primaryThemeFormatted);
          }
          let filled = 0;
          for (const x of out) if (!x.category && theme.has(x.id)) { x.category = theme.get(x.id); filled++; }
          console.log(`  ${location}: backfilled ${filled} categor${filled === 1 ? 'y' : 'ies'} from an undated pass (${theme.size} known)`);
        }
      } catch (e) {
        console.warn(`  ${location}: category backfill failed (non-fatal): ${e.message.slice(0, 80)}`);
      }
    }
  } catch (e) {
    console.error('  [experiences self-host] launch failed:', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  if (!out.length) console.warn(`[experiences] 0 results for "${location}" — soft failure (block, empty, or shape drift)`);
  return out.slice(0, maxItems);
}

// ── Per-experience coordinate enrichment ────────────────────────────────────
// The SEARCH blob carries no coordinates, but each experience DETAIL page
// (https://www.airbnb.com/experiences/<id>) embeds the exact meeting point in
// its own deferred-state JSON, at:
//   ...activityListing.location.userSuppliedCoordinate = { latitude, longitude }
// Verified live on several LA experiences (2026-08). Crucially the detail page
// needs NO JavaScript — a plain HTTPS GET returns the full ~700KB blob — so
// enrichment costs one cheap fetch per experience, not a Chromium page load.

// Same desktop UA the Chromium context presents; keeps the two paths consistent.
const DETAIL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// In-module cache: id → {lat,lng} | null. Misses are cached too (a dead or
// coord-free page stays dead for the rest of the process run — no re-fetch).
const coordsCache = new Map();

// Fetch ONE experience detail page and pull its meeting-point coordinates.
// Returns {lat, lng} or null. Never throws — enrichment is best-effort.
// Accepts either a raw Airbnb id or our namespaced `airbnb:<id>` form.
const rawAirbnbId = (id) => String(id).replace(/^airbnb:/, '');

async function fetchExperienceCoords(id) {
  if (id == null) return null;
  const key = rawAirbnbId(id);
  if (coordsCache.has(key)) return coordsCache.get(key);
  let coords = null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(`https://www.airbnb.com/experiences/${encodeURIComponent(key)}`, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': DETAIL_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (res.ok) {
      const html = await res.text();
      // Regex straight off the raw HTML (cheaper than parsing the 700KB blob).
      // Grab the userSuppliedCoordinate object body, then read latitude and
      // longitude independently so key order / extra keys (__typename) can't
      // break the match.
      const obj = html.match(/"userSuppliedCoordinate"\s*:\s*\{([^{}]*)\}/);
      if (obj) {
        const lat = obj[1].match(/"latitude"\s*:\s*(-?\d+(?:\.\d+)?)/);
        const lng = obj[1].match(/"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/);
        if (lat && lng) coords = { lat: parseFloat(lat[1]), lng: parseFloat(lng[1]) };
      }
    }
  } catch { /* timeout / network / block → null */ }
  clearTimeout(timer);
  coordsCache.set(key, coords);
  return coords;
}

// ── Per-experience review snippets ──────────────────────────────────────────
// The SAME detail page that yields the coordinates also embeds the top of the
// listing's review section — no extra request, no auth, no Chromium. It lives
// in the `data-injector-instances` application/json blob at:
//   ...reviewsSearch.edges[].node          (ActivityListingReviewTextSearch)
//     .review.rating                       1-5 stars
//     .review.localizedCreatedAtDate       "2 days ago" / "May 2026"
//     .review.commentV2                    original-language text
//     .review.localizedCommentV2.localizedString   English translation (UGCText)
//     .review.reviewer.displayFirstName    "Frances"
// Only the first ~7 reviews ship with the page (the other 5,000 load via an
// authenticated GraphQL API) — a taste, which is all the group needs. The
// page's schema.org JSON-LD also carries the overall aggregate:
//   "aggregateRating":{"ratingValue":4.96,"ratingCount":5077}
// Verified live on ids 94033 / 3951041 / 82265 (2026-08).

// In-module cache: id → shaped reviews | null. Misses cached too (see coordsCache).
const reviewsCache = new Map();

// Pull the reviewsSearch edges out of the page HTML: find the application/json
// script that mentions reviewsSearch, parse it, and walk for the edges array —
// same walking strategy as extractExperienceResults.
function extractExperienceReviewEdges(html) {
  const scriptRe = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html))) {
    if (!m[1].includes('"reviewsSearch"')) continue;
    let blob;
    try { blob = JSON.parse(m[1]); } catch { continue; }
    let edges = null;
    const seen = new Set();
    const walk = (o) => {
      if (!o || typeof o !== 'object' || edges) return;
      if (seen.has(o)) return; seen.add(o);
      if (o.reviewsSearch && Array.isArray(o.reviewsSearch.edges)) { edges = o.reviewsSearch.edges; return; }
      for (const k in o) walk(o[k]);
    };
    walk(blob);
    if (edges) return edges;
  }
  return null;
}

// Fetch ONE experience detail page and shape its embedded review snippets into
// the homes ListingReviews shape (server.js shapeReviews): positive (≥4★) and
// negative (≤3★) columns, texts trimmed to 400 chars. Adds a `summary` with the
// page-wide aggregate rating. Returns null when nothing is embedded (block,
// dead id, shape drift). Never throws — reviews are best-effort garnish.
async function fetchExperienceReviews(id, { max = 12 } = {}) {
  if (id == null) return null;
  const key = rawAirbnbId(id);
  if (reviewsCache.has(key)) return reviewsCache.get(key);
  let shaped = null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(`https://www.airbnb.com/experiences/${encodeURIComponent(key)}`, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': DETAIL_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (res.ok) {
      const html = await res.text();
      const edges = extractExperienceReviewEdges(html);
      if (edges && edges.length) {
        const norm = edges.slice(0, max).map(e => {
          const node = e?.node || {};
          const rv = node.review || {};
          // Prefer the English translation, fall back to the original text,
          // then the search-highlight copy (usually identical).
          const text = rv.localizedCommentV2?.localizedString || rv.commentV2 || node.highlightedComment || '';
          return {
            text: String(text).replace(/\s+/g, ' ').trim().slice(0, 400),
            rating: Number.isFinite(+rv.rating) ? +rv.rating : null,
            date: rv.localizedCreatedAtDate ? String(rv.localizedCreatedAtDate).slice(0, 40) : null,
            author: String(rv.reviewer?.displayFirstName || rv.contextualReviewer?.displayFirstName || '').slice(0, 40),
          };
        }).filter(r => r.text);
        // Overall aggregate from the schema.org JSON-LD (regex off raw HTML —
        // exactly one per page, and unambiguous where overallRatingStats isn't).
        let summary = null;
        const agg = html.match(/"aggregateRating"\s*:\s*\{[^{}]*"ratingValue"\s*:\s*([\d.]+)\s*,\s*"ratingCount"\s*:\s*(\d+)/);
        if (agg) summary = { ratingAverage: parseFloat(agg[1]), ratingCount: parseInt(agg[2], 10) };
        if (norm.length) {
          shaped = {
            pos: norm.filter(r => (r.rating ?? 5) >= 4),
            neg: norm.filter(r => (r.rating ?? 5) <= 3),
            total: norm.length,
            summary,
            fetched_at: new Date().toISOString(),
          };
        }
      }
    }
  } catch { /* timeout / network / block → null */ }
  clearTimeout(timer);
  reviewsCache.set(key, shaped);
  return shaped;
}

// Fill lat/lng on rows from searchExperiences(), in place, via a small worker
// pool. Only rows still missing coords are looked up, capped at maxLookups.
// Failures leave lat/lng null; never throws. Returns the same rows array.
async function enrichExperiencesWithCoords(rows, { concurrency = 3, maxLookups = 40 } = {}) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const todo = rows.filter(r => r && r.id && (r.lat == null || r.lng == null)).slice(0, maxLookups);
  let next = 0, hits = 0;
  const worker = async () => {
    while (next < todo.length) {
      const row = todo[next++];
      const cached = coordsCache.has(String(row.id));
      const c = await fetchExperienceCoords(row.id);
      if (c) { row.lat = c.lat; row.lng = c.lng; hits++; }
      // polite jitter between real fetches (cache hits cost nothing, skip it)
      if (!cached && next < todo.length) await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random() * 400)));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker));
  if (todo.length) console.log(`  [experiences coords] resolved ${hits}/${todo.length} lookups`);
  return rows;
}

module.exports = { searchExperiences, enrichExperiencesWithCoords, fetchExperienceCoords, fetchExperienceReviews, mapExperienceNode, extractExperienceResults, parseExperiencePrice, parseOriginalPrice, parsePriceUnit };

// ── Dev CLI ─────────────────────────────────────────────────────────────────
// `node experiences.js "Los Angeles County"`                        (undated)
// `node experiences.js "Los Angeles" 2026-08-14 2026-08-16 4`       (dated, 4 adults)
// `node experiences.js "Los Angeles" --coords`                      (+ coord enrichment, first 10)
// `node experiences.js --reviews 94033`                             (embedded review snippets for one id)
// (COORDS=1 env works too.) Prints the count + first few normalized results as
// JSON — mirrors `pipeline.js airbnb-test`.
if (require.main === module) {
  const args = process.argv.slice(2);
  // --reviews <id>: one cheap HTTPS fetch, no Chromium — print and exit.
  const revIdx = args.indexOf('--reviews');
  if (revIdx !== -1) {
    const id = args[revIdx + 1];
    if (!id) { console.error('usage: node experiences.js --reviews <id>'); process.exit(1); }
    fetchExperienceReviews(id).then(r => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    }).catch(e => { console.error(e); process.exit(1); });
    return;
  }
  const wantCoords = args.includes('--coords') || process.env.COORDS === '1';
  const pos = args.filter(a => !a.startsWith('--'));   // flags don't shift positionals
  const location = pos[0] || 'Los Angeles';
  const checkin  = pos[1] || process.env.CHECKIN  || null;
  const checkout = pos[2] || process.env.CHECKOUT || null;
  const adults   = parseInt(pos[3] || process.env.ADULTS || '2', 10);
  searchExperiences({ location, checkin, checkout, adults, maxItems: 40 }).then(async rows => {
    console.log(`\nTOTAL ${rows.length} experiences for "${location}"${checkin ? ` (${checkin}→${checkout})` : ''}`);
    const priced = rows.filter(r => r.price != null).length;
    const rated  = rows.filter(r => r.rating != null).length;
    const durd   = rows.filter(r => r.duration != null).length;
    console.log(`with price: ${priced} · with rating: ${rated} · with duration: ${durd}`);
    if (wantCoords) {
      await enrichExperiencesWithCoords(rows, { maxLookups: 10 });
      const located = rows.filter(r => r.lat != null && r.lng != null);
      console.log(`with coords: ${located.length}`);
      console.log('\nenriched sample:', JSON.stringify(located.slice(0, 10).map(
        ({ id, title, lat, lng, category, price }) => ({ id, title, lat, lng, category, price })), null, 2));
    } else {
      console.log('\nsample:', JSON.stringify(rows.slice(0, 5), null, 2));
    }
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
}
