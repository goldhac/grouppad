#!/usr/bin/env node
'use strict';

/**
 * GroupPad LA Rental Pipeline
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 1  — Discover   : Apify VRBO + Airbnb actors (7 LA locations)
 * Stage 2  — Dedupe     : SQLite upsert on (source, listing_id)
 * Stage 3a — Pre-filter : bedrooms >= 7 (fast, no price needed)
 * Stage 3b — Prices     : Playwright fetches exact prices for candidates
 *                         that have no price yet (dates + adults baked in URL)
 * Stage 3c — Budget     : drop est all-in > $7,000
 * Stage 4  — Enrich     : Firecrawl structured JSON on survivors only
 * ─────────────────────────────────────────────────────────────────────────────
 * Env vars:
 *   APIFY_TOKEN        — required
 *   CHROMIUM_PATH      — required for Playwright price fetch (set by Dockerfile)
 *   FIRECRAWL_API_KEY  — optional (enrichment skipped if absent)
 */

const path     = require('path');
const Database = require('better-sqlite3');

const APIFY_TOKEN    = process.env.APIFY_TOKEN;
const FIRECRAWL_KEY  = process.env.FIRECRAWL_API_KEY;
const CHROMIUM_PATH  = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const DB_PATH        = path.join(__dirname, 'data', 'pipeline.db');

// ── Trip constants ────────────────────────────────────────────────────────────
const TRIP = {
  checkin:  '2026-08-18',
  checkout: '2026-08-23',
  adults:   16,
  nights:   5,
};
const LOCATIONS = [
  'Los Angeles CA', 'Covina CA', 'Glendale CA', 'Pasadena CA',
  'Woodland Hills CA', 'Encino CA', 'Sherman Oaks CA',
];
const TAX_RATE             = 0.14;
const CLEANING_PLACEHOLDER = 400;
const BUDGET               = 7000;
const MIN_BEDROOMS         = 7;

// ── DB ─────────────────────────────────────────────────────────────────────────
function openDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      source        TEXT NOT NULL,
      listing_id    TEXT NOT NULL,
      name          TEXT,
      url           TEXT,
      location      TEXT,
      bedrooms      INTEGER,
      bathrooms     REAL,
      sleeps        INTEGER,
      amenities     TEXT    DEFAULT '[]',
      photos        TEXT    DEFAULT '[]',
      has_pool      INTEGER DEFAULT 0,
      has_parking   INTEGER DEFAULT 0,
      rating        REAL,
      reviews       INTEGER,
      passed_filter INTEGER DEFAULT 0,
      enriched      INTEGER DEFAULT 0,
      first_seen    TEXT    DEFAULT (datetime('now')),
      last_seen     TEXT    DEFAULT (datetime('now')),
      PRIMARY KEY (source, listing_id)
    );
    CREATE TABLE IF NOT EXISTS price_snapshots (
      source       TEXT    NOT NULL,
      listing_id   TEXT    NOT NULL,
      run_date     TEXT    NOT NULL,
      price_total  REAL,
      nights       INTEGER,
      available    INTEGER DEFAULT 1,
      PRIMARY KEY (source, listing_id, run_date)
    );
  `);
  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePrice(str) {
  if (!str) return null;
  const m = String(str).match(/\$([\d,]+(?:\.\d{2})?)/);
  return m ? Math.round(parseFloat(m[1].replace(/,/g, ''))) : null;
}

function parseBedrooms(roomInfo) {
  if (!roomInfo) return null;
  const m = String(roomInfo).match(/(\d+)\s*bed(?:room)?s?/i);
  return m ? parseInt(m[1]) : null;
}

function parseBathrooms(roomInfo) {
  if (!roomInfo) return null;
  const m = String(roomInfo).match(/([\d.]+)\s*(?:private\s+)?bath/i);
  return m ? parseFloat(m[1]) : null;
}

function parseBathroomsFromName(name) {
  if (!name) return null;
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
  return m ? parseFloat(m[1]) : null;
}

function amenityMatch(arr, keywords) {
  if (!Array.isArray(arr) || !arr.length) return false;
  return arr.some(a => keywords.some(kw => String(a).toLowerCase().includes(kw)));
}

function estimateAllIn(priceTotal, source) {
  // Airbnb priceAmount already includes cleaning fee — just add tax
  // VRBO total may not include cleaning — add placeholder + tax
  const base = (source === 'airbnb') ? priceTotal : priceTotal + CLEANING_PLACEHOLDER;
  return Math.round(base * (1 + TAX_RATE));
}

function listingUrlWithDates(listingId, source) {
  if (source === 'airbnb') {
    return `https://www.airbnb.com/rooms/${listingId}?check_in=${TRIP.checkin}&check_out=${TRIP.checkout}&adults=${TRIP.adults}`;
  }
  return `https://www.vrbo.com/${listingId}?startDate=${TRIP.checkin}&endDate=${TRIP.checkout}&adults=${TRIP.adults}`;
}

// ── Stage 1 — Apify ───────────────────────────────────────────────────────────
async function runApify(actorSlug, input, timeoutMs = 300000) {
  const url  = `https://api.apify.com/v2/acts/${actorSlug}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    console.log(`  → ${actorSlug}`);
    const res = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    clearTimeout(tid);
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error(`  [Apify] HTTP ${res.status}:`, err.slice(0, 200));
      return [];
    }
    return await res.json();
  } catch (e) {
    clearTimeout(tid);
    console.error(`  [Apify] ${actorSlug} failed:`, e.message);
    return [];
  }
}

async function discoverVrbo() {
  console.log('\n[Stage 1] VRBO');
  const items = await runApify('makework36~vrbo-scraper', {
    locations:    LOCATIONS,
    checkIn:      TRIP.checkin,
    checkOut:     TRIP.checkout,
    adults:       TRIP.adults,
    maxResults:   500,
    propertyType: 'VACATION_RENTAL_ONLY',
    currency:     'USD',
    locale:       'en_US',
  });
  console.log(`  Returned ${items.length} items`);

  // Filter out obvious non-CA results (Glendale AZ, Phoenix area etc.)
  const filtered = items.filter(item => {
    const loc = (item.location || '').toLowerCase();
    const urlStr = (item.url || '').toLowerCase();
    const azMatch = /\bphoenix|scottsdale|tempe|mesa|chandler|gilbert|arizona\b|\baz\b|glendale.*az|az.*glendale/i.test(loc + ' ' + urlStr);
    return !azMatch;
  });
  console.log(`  After CA filter: ${filtered.length}`);

  return filtered.map(item => ({
    source:      'vrbo',
    listing_id:  String(item.id),
    name:        item.name,
    url:         `https://www.vrbo.com/${item.id}`,
    location:    item.location || item.searchedLocation || '',
    bedrooms:    typeof item.bedrooms === 'number' ? item.bedrooms : null,
    bathrooms:   typeof item.bathrooms === 'number' ? item.bathrooms : parseBathroomsFromName(item.name),
    sleeps:      typeof item.sleeps === 'number'    ? item.sleeps    : null,
    amenities:   Array.isArray(item.amenities)      ? item.amenities : [],
    photos:      Array.isArray(item.photos)         ? item.photos    : [],
    has_pool:    amenityMatch(item.amenities, ['pool', 'hot tub', 'swimming']) ? 1 : 0,
    has_parking: amenityMatch(item.amenities, ['parking', 'garage', 'driveway']) ? 1 : 0,
    rating:      item.rating       ?? null,
    reviews:     item.reviewsCount ?? null,
    price_total: parsePrice(item.priceFormatted || item.priceLabel),
  }));
}

async function discoverAirbnb() {
  console.log('\n[Stage 1] Airbnb');
  const items = await runApify('makework36~fast-airbnb-price-scraper', {
    locations:   LOCATIONS,
    checkin:     TRIP.checkin,
    checkout:    TRIP.checkout,
    adults:      TRIP.adults,
    maxListings: 100,        // actor cap is 100/location; 7 locations = up to 700
    roomType:    'entire',   // entire homes only
    currency:    'USD',
  });
  console.log(`  Returned ${items.length} items`);

  return items.map(item => ({
    source:      'airbnb',
    listing_id:  String(item.id),
    name:        item.name,
    url:         `https://www.airbnb.com/rooms/${item.id}`,
    location:    item.locationLabel || item.location || '',
    bedrooms:    parseBedrooms(item.roomInfo),
    bathrooms:   parseBathrooms(item.roomInfo),
    sleeps:      typeof item.maxGuestCapacity === 'number' ? item.maxGuestCapacity : null,
    amenities:   [],
    photos:      Array.isArray(item.photos) ? item.photos : [],
    has_pool:    0,
    has_parking: 0,
    rating:      item.rating       ?? null,
    reviews:     item.reviewsCount ?? null,
    // priceAmount is the full stay total (5 nights) — Airbnb already includes fees
    price_total: typeof item.priceAmount === 'number' ? item.priceAmount : parsePrice(item.price),
  }));
}

// ── Stage 2 — Upsert ──────────────────────────────────────────────────────────
function upsertAll(db, rows) {
  const today = new Date().toISOString().slice(0, 10);

  const upsertListing = db.prepare(`
    INSERT INTO listings
      (source, listing_id, name, url, location, bedrooms, bathrooms, sleeps,
       amenities, photos, has_pool, has_parking, rating, reviews)
    VALUES
      (@source, @listing_id, @name, @url, @location, @bedrooms, @bathrooms, @sleeps,
       @amenities, @photos, @has_pool, @has_parking, @rating, @reviews)
    ON CONFLICT(source, listing_id) DO UPDATE SET
      name        = EXCLUDED.name,
      url         = EXCLUDED.url,
      location    = EXCLUDED.location,
      bedrooms    = COALESCE(EXCLUDED.bedrooms,  listings.bedrooms),
      bathrooms   = COALESCE(EXCLUDED.bathrooms, listings.bathrooms),
      sleeps      = COALESCE(EXCLUDED.sleeps,    listings.sleeps),
      amenities   = EXCLUDED.amenities,
      photos      = EXCLUDED.photos,
      has_pool    = CASE WHEN EXCLUDED.has_pool    = 1 THEN 1 ELSE listings.has_pool    END,
      has_parking = CASE WHEN EXCLUDED.has_parking = 1 THEN 1 ELSE listings.has_parking END,
      rating      = COALESCE(EXCLUDED.rating,  listings.rating),
      reviews     = COALESCE(EXCLUDED.reviews, listings.reviews),
      last_seen   = datetime('now')
  `);

  const upsertSnap = db.prepare(`
    INSERT INTO price_snapshots (source, listing_id, run_date, price_total, nights)
    VALUES (@source, @listing_id, @run_date, @price_total, @nights)
    ON CONFLICT(source, listing_id, run_date) DO UPDATE SET
      price_total = EXCLUDED.price_total, available = 1
  `);

  let newRows = 0, updatedRows = 0;
  const txn = db.transaction(() => {
    for (const row of rows) {
      const exists = db.prepare('SELECT 1 FROM listings WHERE source=? AND listing_id=?')
        .get(row.source, row.listing_id);
      upsertListing.run({
        ...row,
        amenities: JSON.stringify(row.amenities),
        photos:    JSON.stringify((row.photos).slice(0, 8)),
      });
      if (exists) updatedRows++; else newRows++;
      if (row.price_total) {
        upsertSnap.run({
          source: row.source, listing_id: row.listing_id,
          run_date: today, price_total: row.price_total, nights: TRIP.nights,
        });
      }
    }
  });
  txn();
  console.log(`\n[Stage 2] ${rows.length} rows → ${newRows} new, ${updatedRows} updated`);
}

// ── Stage 3b — Playwright price fetch ─────────────────────────────────────────
// Launches headless Chrome, navigates to listing with trip dates baked in,
// waits for price to render, extracts "$X,XXX total" from the page.

async function playwrightPrice(listingId, source) {
  let browser;
  try {
    const { chromium } = require('playwright-core');
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const ctx  = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    const url  = listingUrlWithDates(listingId, source);
    console.log(`    ↗ ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (source === 'airbnb') {
      await page.waitForSelector(
        '[data-testid="book-it-default"], [data-section-id="BOOK_IT_SIDEBAR"]',
        { timeout: 15000 }
      ).catch(() => {});
    } else {
      // VRBO: wait for price widget
      await page.waitForSelector('[data-stid="price-lockup"], .uitk-price', { timeout: 12000 }).catch(() => {});
    }
    await page.waitForTimeout(5000); // let XHR / client-side price load

    const allText = await page.evaluate(() => document.body.innerText || '');
    const patterns = [
      /\$([\d,]+(?:\.\d{2})?)\s+total\b/i,
      /total\b[^$\n]{0,50}\$([\d,]+(?:\.\d{2})?)/i,
      /\$([\d,]+(?:\.\d{2})?)\s+for\s+5\s+nights?/i,
      /\$([\d,]+(?:\.\d{2})?)\s+for\s+4\s+nights?/i,
      // VRBO total label
      /total\s+charges?[^$\n]*\$([\d,]+)/i,
    ];
    for (const re of patterns) {
      const m = allText.match(re);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (val >= 1000 && val <= 200000) {
          console.log(`    ✓ price $${val.toLocaleString()} (from visible text)`);
          return Math.round(val);
        }
      }
    }

    // Fallback: rendered HTML snapshot → JSON patterns
    const html = await page.content();
    const htmlPatterns = [
      { re: /"accessibilityLabel"\s*:\s*"\\?\$([\d,]+)(?:\.\d+)?\s+total"/i, scale: 1 },
      { re: /"totalAmount"\s*:\s*\{\s*"[a-z]+"\s*:\s*(\d+(?:\.\d+)?)/i,      scale: 1 },
      { re: /"amountMicros"\s*:\s*"(\d+)"/i,                                  scale: 1e-6 },
      { re: /\$\s*([\d,]+(?:\.\d{2})?)\s+total\b/i,                           scale: 1 },
    ];
    for (const { re, scale } of htmlPatterns) {
      const m = html.match(re);
      if (m) {
        const val = Math.round(parseFloat(m[1].replace(/,/g, '')) * scale);
        if (val >= 1000 && val <= 200000) {
          console.log(`    ✓ price $${val.toLocaleString()} (from rendered HTML)`);
          return val;
        }
      }
    }

    console.log('    ✗ no price found');
    return null;
  } catch (e) {
    console.error(`    [Playwright] ${e.message.slice(0, 100)}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function fetchMissingPrices(db) {
  const today = new Date().toISOString().slice(0, 10);

  // Listings with enough bedrooms but no price snapshot today
  const candidates = db.prepare(`
    SELECT l.source, l.listing_id, l.bedrooms
    FROM listings l
    WHERE l.bedrooms >= ?
      AND NOT EXISTS (
        SELECT 1 FROM price_snapshots p
        WHERE p.source = l.source AND p.listing_id = l.listing_id AND p.run_date = ?
      )
  `).all(MIN_BEDROOMS, today);

  if (!candidates.length) {
    console.log('\n[Stage 3b] All bedroom-passing listings already have prices today');
    return;
  }
  console.log(`\n[Stage 3b] Playwright price fetch for ${candidates.length} listings without today's price`);

  const insertSnap = db.prepare(`
    INSERT INTO price_snapshots (source, listing_id, run_date, price_total, nights)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source, listing_id, run_date) DO UPDATE SET price_total = EXCLUDED.price_total
  `);

  for (const c of candidates) {
    console.log(`  ${c.source}/${c.listing_id} (${c.bedrooms} bd)`);
    const price = await playwrightPrice(c.listing_id, c.source);
    if (price) insertSnap.run(c.source, c.listing_id, today, price, TRIP.nights);
    // Small delay between launches
    await new Promise(r => setTimeout(r, 1500));
  }
}

// ── Stage 3c — Budget filter ───────────────────────────────────────────────────
function filterListings(db) {
  db.prepare('UPDATE listings SET passed_filter = 0').run();

  const rows = db.prepare(`
    SELECT l.source, l.listing_id, l.bedrooms, ps.price_total
    FROM listings l
    LEFT JOIN (
      SELECT source, listing_id, price_total
      FROM price_snapshots
      WHERE (source, listing_id, run_date) IN (
        SELECT source, listing_id, MAX(run_date)
        FROM price_snapshots GROUP BY source, listing_id
      )
    ) ps ON ps.source = l.source AND ps.listing_id = l.listing_id
  `).all();

  const pass = db.prepare('UPDATE listings SET passed_filter = 1 WHERE source=? AND listing_id=?');
  let passed = 0;
  for (const r of rows) {
    if (!r.bedrooms || r.bedrooms < MIN_BEDROOMS) continue;
    if (r.price_total) {
      const est = estimateAllIn(r.price_total, r.source);
      if (est > BUDGET) continue;
    }
    pass.run(r.source, r.listing_id);
    passed++;
  }
  console.log(`\n[Stage 3c] ${passed} / ${rows.length} listings passed (beds >= ${MIN_BEDROOMS}, est ≤ $${BUDGET.toLocaleString()})`);
}

// ── Stage 4 — Firecrawl enrichment ────────────────────────────────────────────
async function firecrawlEnrich(url) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Authorization': `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        formats: ['json'],
        jsonOptions: {
          schema: {
            type: 'object',
            properties: {
              bedrooms:    { type: 'integer' },
              bathrooms:   { type: 'number'  },
              maxGuests:   { type: 'integer' },
              cleaningFee: { type: 'number'  },
              amenities:   { type: 'array', items: { type: 'string' } },
              rating:      { type: 'number'  },
              reviewCount: { type: 'integer' },
            },
          },
        },
      }),
    });
    clearTimeout(tid);
    if (!res.ok) { console.error(`  [Firecrawl] HTTP ${res.status}`); return null; }
    const data = await res.json();
    // Return null if all key fields are 0/empty (bot-wall redirect)
    const extracted = data?.data?.json ?? data?.json ?? null;
    if (!extracted) return null;
    if (!extracted.bedrooms && !extracted.bathrooms && !extracted.rating) return null;
    return extracted;
  } catch (e) { clearTimeout(tid); console.error(`  [Firecrawl] ${e.message}`); return null; }
}

async function enrichSurvivors(db) {
  if (!FIRECRAWL_KEY) { console.log('\n[Stage 4] No FIRECRAWL_API_KEY — skipping'); return; }
  const survivors = db.prepare(
    'SELECT source, listing_id, url FROM listings WHERE passed_filter=1 AND enriched=0'
  ).all();
  console.log(`\n[Stage 4] Enriching ${survivors.length} un-enriched survivors…`);

  const applyEnrich = db.prepare(`
    UPDATE listings SET
      bedrooms    = COALESCE(@bedrooms,    bedrooms),
      bathrooms   = COALESCE(@bathrooms,   bathrooms),
      sleeps      = COALESCE(@sleeps,      sleeps),
      amenities   = COALESCE(@amenities,   amenities),
      has_pool    = CASE WHEN @has_pool    = 1 THEN 1 ELSE has_pool    END,
      has_parking = CASE WHEN @has_parking = 1 THEN 1 ELSE has_parking END,
      rating      = COALESCE(@rating,      rating),
      reviews     = COALESCE(@reviews,     reviews),
      enriched    = 1, last_seen = datetime('now')
    WHERE source=@source AND listing_id=@listing_id
  `);

  for (const row of survivors) {
    console.log(`  ${row.source}/${row.listing_id}`);
    const data = await firecrawlEnrich(row.url);
    if (data) {
      const amenArr = Array.isArray(data.amenities) ? data.amenities : [];
      applyEnrich.run({
        source: row.source, listing_id: row.listing_id,
        bedrooms: data.bedrooms || null, bathrooms: data.bathrooms || null,
        sleeps:   data.maxGuests  || null,
        amenities: amenArr.length ? JSON.stringify(amenArr) : null,
        has_pool:    amenityMatch(amenArr, ['pool', 'swimming', 'hot tub', 'jacuzzi']) ? 1 : 0,
        has_parking: amenityMatch(amenArr, ['parking', 'garage', 'driveway', 'carport']) ? 1 : 0,
        rating: data.rating || null, reviews: data.reviewCount || null,
      });
      console.log(`    ✓ beds=${data.bedrooms} ba=${data.bathrooms} pool=${amenityMatch(amenArr,['pool'])?'yes':'no'}`);
    } else {
      db.prepare('UPDATE listings SET enriched=1 WHERE source=? AND listing_id=?')
        .run(row.source, row.listing_id);
      console.log('    (no data — will skip on next run)');
    }
    await new Promise(r => setTimeout(r, 1200));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!APIFY_TOKEN) { console.error('ERROR: APIFY_TOKEN required'); process.exit(1); }

  const start = Date.now();
  console.log('═══════════════════════════════════════════════════');
  console.log(' GroupPad LA Rental Pipeline');
  console.log(` Run: ${new Date().toISOString().slice(0, 16)} UTC`);
  console.log('═══════════════════════════════════════════════════');

  const db = openDb();

  // Stage 1 — discover (parallel)
  const [vrboRows, airbnbRows] = await Promise.all([discoverVrbo(), discoverAirbnb()]);
  const allRows = [...vrboRows, ...airbnbRows];
  console.log(`\n  Total: ${allRows.length} (${vrboRows.length} VRBO + ${airbnbRows.length} Airbnb)`);

  // Stage 2 — upsert
  upsertAll(db, allRows);

  // Stage 3b — Playwright: get prices for bedroom-qualifying listings that have none
  await fetchMissingPrices(db);

  // Stage 3c — budget filter
  filterListings(db);

  // Stage 4 — enrich survivors
  await enrichSurvivors(db);

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  const survivors = db.prepare('SELECT COUNT(*) as n FROM listings WHERE passed_filter=1').get();
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` Done in ${secs}s — ${survivors.n} listings on site ✓`);
  console.log('═══════════════════════════════════════════════════\n');

  db.close();
}

main().catch(e => { console.error('[Pipeline] Fatal:', e); process.exit(1); });
