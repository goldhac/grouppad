// ─────────────────────────────────────────────────────────────────────────────
// viator.js — bookable tours & activities from the Viator Partner API (v2).
//
// Source 3, after Airbnb (scraped) and OSM (free/open). Viator is the piece the
// other two can't cover: ticketed, bookable things to do with real pricing and
// traveler ratings. Unlike every other marketplace we probed (GetYourGuide,
// Klook, Viator's own website — all DataDome/Cloudflare walled), this is a
// sanctioned API, so it needs no scraping and can't be blocked out from under us.
//
// Contract (from the partner dashboard's own "API Documentation" link, which
// points at docs.viator.com/partner-api/technical/ — the v2 API):
//   • base    https://api.viator.com/partner   (sandbox: api.sandbox.viator.com)
//   • headers exp-api-key + Accept: application/json;version=2.0
//   • Basic access covers what we need: product search + single product data.
//     It does NOT cover bulk endpoints, live availability, or booking.
//
// Two gotchas worth knowing before debugging a 401:
//   • A NEWLY ISSUED KEY IS NOT LIVE IMMEDIATELY — the dashboard says "it can
//     take up to 24 hours for the key to be active", and until then every call
//     returns 401 UNAUTHORIZED "Invalid API Key". A 401 here is far more likely
//     to be activation lag than a wrong key.
//   • Sandbox keys answer from a small FIXED test catalogue, not the real one.
//     Real destination results need a production key (which in turn requires
//     contact details on the partner account).
//
// Rows come back in the SAME normalized shape as experiences.js / osm.js, with
// namespaced ids (`viator:5010SYDNEY`) so votes/saves/day-pins can never collide
// with another provider's ids.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const BASE = (process.env.VIATOR_API_BASE || 'https://api.viator.com/partner').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.VIATOR_TIMEOUT_MS || 20000);
// Destinations and tags are effectively static reference data — refetching a
// ~2MB destination list on every trip refresh would be wasteful and rude.
const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const apiKey = () => process.env.VIATOR_API_KEY || '';

function headers() {
  return {
    'exp-api-key': apiKey(),
    Accept: 'application/json;version=2.0',
    'Accept-Language': 'en-US',
    'Content-Type': 'application/json',
  };
}

/** One API call. Throws on non-2xx so callers can log the real reason. */
async function call(pathname, { method = 'GET', body = null } = {}) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + pathname, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // Viator returns a JSON envelope with a `code` — surface it verbatim, and
      // name the activation-lag case explicitly so it isn't mistaken for a typo'd key.
      let code = '';
      try { code = JSON.parse(text).code || ''; } catch {}
      const hint = res.status === 401
        ? ' (a new key can take up to 24h to activate — check the partner dashboard)'
        : '';
      throw new Error(`${method} ${pathname} → ${res.status} ${code}${hint}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(to);
  }
}

// ── Reference data (destinations, tags), cached on disk ──────────────────────

function cacheFile(name) {
  const dir = path.join(process.env.PIPELINE_DATA_DIR || path.join(__dirname, 'data'), 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `viator-${name}.json`);
}

async function cached(name, fetcher) {
  const file = cacheFile(name);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < REF_TTL_MS) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  const fresh = await fetcher();
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(fresh));
    fs.renameSync(tmp, file);
  } catch (e) { console.warn(`[viator] could not cache ${name}: ${e.message}`); }
  return fresh;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

/**
 * Trip destination string → Viator destination id.
 * Trips store free text ("Los Angeles", "Los Angeles, CA"), so match on the
 * part before the first comma and prefer a CITY over a REGION/COUNTRY of the
 * same name (Viator has both "New York" the city and the state).
 */
async function resolveDestinationId(destination) {
  const wanted = norm(String(destination || '').split(',')[0]);
  if (!wanted) return null;
  // Trailing slashes match Viator's own Basic-access Postman collection verbatim.
  const data = await cached('destinations', () => call('/destinations/'));
  const all = data.destinations || [];
  const hits = all.filter((d) => norm(d.name) === wanted);
  if (!hits.length) {
    console.warn(`[viator] no destination matched "${destination}"`);
    return null;
  }
  const rank = { CITY: 0, TOWN: 1, REGION: 2, COUNTRY: 3 };
  hits.sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
  const best = hits[0];
  console.log(`[viator] "${destination}" → destination ${best.destinationId} (${best.name}, ${best.type})`);
  return String(best.destinationId);
}

/** Numeric tag id → human label, so cards and vibe chips have a category. */
async function tagLabels() {
  try {
    const data = await cached('tags', () => call('/products/tags/'));
    const out = {};
    for (const t of data.tags || []) {
      const name = t.allNamesByLocale?.en || t.allNamesByLocale?.['en-US'];
      if (name) out[String(t.tagId)] = name;
    }
    return out;
  } catch (e) {
    console.warn(`[viator] tag lookup failed (non-fatal): ${e.message}`);
    return {};
  }
}

// ── Mapping ──────────────────────────────────────────────────────────────────

/** Pick a card-sized image (~480px wide) from the cover image's variants. */
function pickPhoto(images = []) {
  const img = images.find((i) => i.isCover) || images[0];
  const variants = (img && img.variants) || [];
  if (!variants.length) return null;
  const sorted = [...variants].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find((v) => (v.width || 0) >= 480) || sorted[sorted.length - 1]).url || null;
}

function pickDuration(duration = {}) {
  if (typeof duration.fixedDurationInMinutes === 'number') return duration.fixedDurationInMinutes;
  if (typeof duration.variableDurationFromMinutes === 'number') return duration.variableDurationFromMinutes;
  return null;
}

function mapProduct(p, labels = {}) {
  const code = p.productCode;
  if (!code) return null;
  const price = p.pricing?.summary?.fromPrice;
  const was = p.pricing?.summary?.fromPriceBeforeDiscount;

  // Tags come back as numeric ids; the first one we have a label for is the most
  // useful category. Null (not "Tour") when we can't resolve one — never invent.
  const category = (p.tags || []).map((t) => labels[String(t)]).find(Boolean) || null;

  return {
    id: `viator:${code}`,
    source: 'viator',
    title: String(p.title || '').slice(0, 120),
    category,
    price: typeof price === 'number' ? price : null,
    currency: p.pricing?.currency || 'USD',
    // Only a genuine markdown counts — Viator sends the pre-discount price even
    // when it equals the current one, which would render a "Save $0" badge.
    originalPrice: typeof was === 'number' && typeof price === 'number' && was > price ? was : null,
    // Viator's fromPrice is always per traveler.
    priceUnit: 'guest',
    rating: typeof p.reviews?.combinedAverageRating === 'number' ? p.reviews.combinedAverageRating : null,
    reviews: typeof p.reviews?.totalReviews === 'number' ? p.reviews.totalReviews : null,
    url: p.productUrl || `https://www.viator.com/tours/d/${code}`,
    photo: pickPhoto(p.images),
    // Product SUMMARIES carry no coordinates — those live on the single-product
    // endpoint behind a location-ref lookup. Distance chips simply don't render
    // for these rows, exactly as they don't for Airbnb rows whose lookup failed.
    lat: null,
    lng: null,
    duration: pickDuration(p.duration),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Bookable things to do for a trip's destination. Soft-fails to [] — never
 * throws, so a Viator outage can't take down the experiences refresh.
 */
async function searchViatorExperiences({ destination, checkin = null, checkout = null, limit = 30 } = {}) {
  if (!apiKey()) { console.log('[viator] VIATOR_API_KEY not set — skipping'); return []; }
  // A sandbox key answers from a small fixed TEST catalogue. Those rows would
  // look real on the board, so refuse them outside an explicit test run rather
  // than quietly seeding a live trip with invented tours.
  if (/sandbox/.test(BASE) && process.env.VIATOR_ALLOW_SANDBOX !== '1') {
    console.warn('[viator] refusing to publish sandbox test data to a live board (set VIATOR_ALLOW_SANDBOX=1 to override)');
    return [];
  }

  const t0 = Date.now();
  try {
    const destId = await resolveDestinationId(destination);
    if (!destId) return [];

    const filtering = { destination: destId };
    // Date-bounding drops products that don't run during the trip. Only send it
    // when we have both ends — a half-open range is rejected.
    if (checkin && checkout) { filtering.startDate = checkin; filtering.endDate = checkout; }

    const data = await call('/products/search', {
      method: 'POST',
      body: {
        filtering,
        sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
        pagination: { start: 1, count: Math.min(Number(limit) || 30, 50) },
        currency: 'USD',
      },
    });

    const products = data.products || [];
    const labels = products.length ? await tagLabels() : {};
    const rows = products.map((p) => mapProduct(p, labels)).filter(Boolean);
    console.log(`[viator] ${rows.length} products for "${destination}" in ${Date.now() - t0}ms`);
    return rows;
  } catch (e) {
    console.warn(`[viator] search failed (non-fatal): ${e.message}`);
    return [];
  }
}

module.exports = { searchViatorExperiences, resolveDestinationId, mapProduct, pickPhoto };

// Dev CLI:  VIATOR_API_KEY=… node viator.js "Los Angeles"
if (require.main === module) {
  searchViatorExperiences({ destination: process.argv[2] || 'Los Angeles', limit: 10 }).then((rows) => {
    console.log(`\n${rows.length} products`);
    console.log(JSON.stringify(rows.slice(0, 3), null, 1));
  });
}
