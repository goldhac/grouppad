#!/usr/bin/env node
'use strict';

/**
 * GroupPad LA Rental Pipeline
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 1 — Discover  : Apify VRBO + Airbnb actors (7 LA locations)
 * Stage 2 — Dedupe    : SQLite upsert on (source, listing_id)
 * Stage 3 — Filter    : bedrooms >= 7, est all-in <= $7,000
 * Stage 4 — Enrich    : Firecrawl structured JSON on survivors only
 * ─────────────────────────────────────────────────────────────────────────────
 * Env vars required:
 *   APIFY_TOKEN        — your Apify API token
 *   FIRECRAWL_API_KEY  — your Firecrawl key (optional — enrichment skipped if absent)
 */

const path    = require('path');
const Database = require('better-sqlite3');

const APIFY_TOKEN   = process.env.APIFY_TOKEN;
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const DB_PATH       = path.join(__dirname, 'data', 'pipeline.db');

// ── Trip constants (easy to tweak) ────────────────────────────────────────────
const TRIP = {
  checkin:  '2026-08-18',
  checkout: '2026-08-23',
  adults:   16,
  nights:   5,
};
const LOCATIONS = [
  'Los Angeles', 'Covina', 'Glendale', 'Pasadena',
  'Woodland Hills', 'Encino', 'Sherman Oaks',
];
const TAX_RATE             = 0.14;   // LA transient occupancy tax estimate
const CLEANING_PLACEHOLDER = 400;    // used if cleaning fee not in total
const BUDGET               = 7000;   // all-in budget cap
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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function amenityMatch(arr, keywords) {
  if (!Array.isArray(arr) || !arr.length) return false;
  return arr.some(a => keywords.some(kw => String(a).toLowerCase().includes(kw)));
}

function estimateAllIn(priceTotal) {
  return Math.round((priceTotal + CLEANING_PLACEHOLDER) * (1 + TAX_RATE));
}

// ── Stage 1 — Apify actors ─────────────────────────────────────────────────────

async function runApify(actorSlug, input, timeoutMs = 300000) {
  const url  = `https://api.apify.com/v2/acts/${actorSlug}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    console.log(`  → POST ${url.split('?')[0]}`);
    const res = await fetch(url, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(input),
    });
    clearTimeout(tid);
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error(`  [Apify] HTTP ${res.status}:`, err.slice(0, 300));
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
  console.log('\n[Stage 1] VRBO (makework36/vrbo-scraper)');
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

  return items.map(item => ({
    source:      'vrbo',
    listing_id:  String(item.id),
    name:        item.name,
    url:         item.url,
    location:    item.location || item.searchedLocation || '',
    bedrooms:    typeof item.bedrooms === 'number' ? item.bedrooms : null,
    bathrooms:   typeof item.bathrooms === 'number' ? item.bathrooms : null,
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
  console.log('\n[Stage 1] Airbnb (makework36/fast-airbnb-price-scraper)');
  const items = await runApify('makework36~fast-airbnb-price-scraper', {
    locations:   LOCATIONS,
    checkin:     TRIP.checkin,
    checkout:    TRIP.checkout,
    adults:      TRIP.adults,
    maxListings: 500,
    roomType:    'entire',
    currency:    'USD',
  });
  console.log(`  Returned ${items.length} items`);

  return items.map(item => ({
    source:      'airbnb',
    listing_id:  String(item.id),
    name:        item.name,
    url:         item.url,
    location:    item.locationLabel || item.location || '',
    bedrooms:    parseBedrooms(item.roomInfo),
    bathrooms:   parseBathrooms(item.roomInfo),
    sleeps:      typeof item.maxGuestCapacity === 'number' ? item.maxGuestCapacity : null,
    amenities:   [], // not available at search level; filled by enrichment
    photos:      Array.isArray(item.photos) ? item.photos : [],
    has_pool:    0,
    has_parking: 0,
    rating:      item.rating       ?? null,
    reviews:     item.reviewsCount ?? null,
    price_total: typeof item.priceAmount === 'number' ? item.priceAmount : parsePrice(item.price),
  }));
}

// ── Stage 2 — Dedupe / upsert ──────────────────────────────────────────────────

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
      price_total = EXCLUDED.price_total,
      available   = 1
  `);

  let newRows = 0, updatedRows = 0;

  const txn = db.transaction(() => {
    for (const row of rows) {
      const exists = db.prepare(
        'SELECT 1 FROM listings WHERE source=? AND listing_id=?'
      ).get(row.source, row.listing_id);

      upsertListing.run({
        ...row,
        amenities: JSON.stringify(row.amenities),
        photos:    JSON.stringify((row.photos).slice(0, 8)),
      });

      if (exists) updatedRows++; else newRows++;

      if (row.price_total) {
        upsertSnap.run({
          source:      row.source,
          listing_id:  row.listing_id,
          run_date:    today,
          price_total: row.price_total,
          nights:      TRIP.nights,
        });
      }
    }
  });

  txn();
  console.log(`\n[Stage 2] Upserted ${rows.length} rows: ${newRows} new, ${updatedRows} updated`);
}

// ── Stage 3 — Filter ───────────────────────────────────────────────────────────

function filterListings(db) {
  // Reset all first so stale survivors don't accumulate
  db.prepare('UPDATE listings SET passed_filter = 0').run();

  const rows = db.prepare(`
    SELECT l.source, l.listing_id, l.bedrooms,
           ps.price_total
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

  const pass = db.prepare(
    'UPDATE listings SET passed_filter = 1 WHERE source=? AND listing_id=?'
  );

  let passed = 0;
  for (const r of rows) {
    // Bedroom gate
    if (!r.bedrooms || r.bedrooms < MIN_BEDROOMS) continue;

    // Budget gate — if no price yet, let it through so enrichment can get the price
    if (r.price_total) {
      const est = estimateAllIn(r.price_total);
      if (est > BUDGET) continue;
    }

    pass.run(r.source, r.listing_id);
    passed++;
  }

  console.log(`\n[Stage 3] ${passed} / ${rows.length} listings passed (beds >= ${MIN_BEDROOMS}, est all-in <= $${BUDGET.toLocaleString()})`);
}

// ── Stage 4 — Firecrawl enrichment ────────────────────────────────────────────

async function firecrawlEnrich(url) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method:  'POST',
      signal:  ctrl.signal,
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_KEY}`,
        'Content-Type':  'application/json',
      },
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
              nightlyPrice: { type: 'number' },
              cleaningFee: { type: 'number'  },
              amenities:   { type: 'array', items: { type: 'string' } },
              houseRules:  { type: 'string'  },
              rating:      { type: 'number'  },
              reviewCount: { type: 'integer' },
            },
          },
        },
      }),
    });
    clearTimeout(tid);
    if (!res.ok) {
      console.error(`  [Firecrawl] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.data?.json ?? data?.json ?? null;
  } catch (e) {
    clearTimeout(tid);
    console.error(`  [Firecrawl] ${e.message}`);
    return null;
  }
}

async function enrichSurvivors(db) {
  if (!FIRECRAWL_KEY) {
    console.log('\n[Stage 4] No FIRECRAWL_API_KEY — skipping enrichment');
    return;
  }

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
      enriched    = 1,
      last_seen   = datetime('now')
    WHERE source=@source AND listing_id=@listing_id
  `);

  const markEnriched = db.prepare(
    'UPDATE listings SET enriched=1 WHERE source=? AND listing_id=?'
  );

  for (const row of survivors) {
    console.log(`  Enriching ${row.source}/${row.listing_id}…`);
    const data = await firecrawlEnrich(row.url);

    if (data) {
      const amenArr = Array.isArray(data.amenities) ? data.amenities : [];
      applyEnrich.run({
        source:      row.source,
        listing_id:  row.listing_id,
        bedrooms:    data.bedrooms    || null,
        bathrooms:   data.bathrooms   || null,
        sleeps:      data.maxGuests   || null,
        amenities:   amenArr.length ? JSON.stringify(amenArr) : null,
        has_pool:    amenityMatch(amenArr, ['pool', 'swimming', 'hot tub', 'jacuzzi']) ? 1 : 0,
        has_parking: amenityMatch(amenArr, ['parking', 'garage', 'driveway', 'carport']) ? 1 : 0,
        rating:      data.rating      || null,
        reviews:     data.reviewCount || null,
      });
      console.log(`    ✓ beds=${data.bedrooms} ba=${data.bathrooms} pool=${amenityMatch(data.amenities||[], ['pool']) ? 'yes' : 'no'}`);
    } else {
      // Mark enriched so we don't retry every run (could just be a bot-wall)
      markEnriched.run(row.source, row.listing_id);
      console.log('    ✗ No data returned — marked enriched to skip on next run');
    }

    // Polite throttle
    await new Promise(r => setTimeout(r, 1200));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!APIFY_TOKEN) {
    console.error('ERROR: APIFY_TOKEN env var is required');
    process.exit(1);
  }

  const start = Date.now();
  console.log('═══════════════════════════════════════════════════');
  console.log(' GroupPad LA Rental Pipeline');
  console.log(` Run date: ${new Date().toISOString().slice(0, 10)}`);
  console.log('═══════════════════════════════════════════════════');

  const db = openDb();
  console.log('DB:', DB_PATH);

  // Stage 1 — run both actors in parallel
  const [vrboRows, airbnbRows] = await Promise.all([discoverVrbo(), discoverAirbnb()]);
  const allRows = [...vrboRows, ...airbnbRows];
  console.log(`\n  Total discovered: ${allRows.length} (${vrboRows.length} VRBO + ${airbnbRows.length} Airbnb)`);

  // Stage 2 — upsert
  upsertAll(db, allRows);

  // Stage 3 — filter
  filterListings(db);

  // Stage 4 — enrich survivors
  await enrichSurvivors(db);

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(` Pipeline complete in ${secs}s ✓`);
  console.log('═══════════════════════════════════════════════════\n');

  db.close();
}

main().catch(e => {
  console.error('[Pipeline] Fatal error:', e);
  process.exit(1);
});
