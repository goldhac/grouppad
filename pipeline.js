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
const DATA_DIR       = process.env.PIPELINE_DATA_DIR || path.join(__dirname, 'data');
try { require('fs').mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const DB_PATH        = path.join(DATA_DIR, 'pipeline.db');

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
// VRBO charges $0.0025 PER returned property result. The 7-location ×
// maxResults:500 search billed ~2000 results ($4.998) but only ~5 survived the
// CA filter. Narrow to one county-wide query + a hard cap so we pay for tens,
// not thousands, of rows. Tune via env without redeploying code.
const VRBO_LOCATIONS = ['Los Angeles CA'];
const VRBO_MAX_RESULTS = Number(process.env.VRBO_MAX_RESULTS || 40);
// Airbnb fast scraper is cheap ($0.002/result). NOTE: this actor currently
// IGNORES maxItems (a 4-location LA search returns ~170/location regardless),
// so the real Airbnb cost lever is the number of AIRBNB_LOCATIONS, not this cap.
// Kept as a best-effort hint in case the actor starts honoring it.
const AIRBNB_MAX_ITEMS = Number(process.env.AIRBNB_MAX_ITEMS || 200);
// Airbnb's fast scraper wants plain city names (no ", CA" suffix breaks geocoding).
// "Los Angeles" alone returns county-wide results; a few extras widen coverage.
// Airbnb is the cheap, high-value source — cast a wider net here. Each location
// adds ~$0.20–0.35/run. "Los Angeles" is county-wide; the rest add Valley,
// beach, and east-county mansion coverage. Override via AIRBNB_LOCATIONS env.
const AIRBNB_LOCATIONS = (process.env.AIRBNB_LOCATIONS ||
  'Los Angeles,Woodland Hills,Pasadena,Long Beach,Malibu,Calabasas')
  .split(',').map(s => s.trim()).filter(Boolean);
const TAX_RATE             = 0.14;
const CLEANING_PLACEHOLDER = 400;
const BUDGET               = 7000;
const MIN_BEDROOMS         = 7;

// Approx driving miles from each LA-area city to Downtown LA (City Hall).
// Keys matched longest-first so "west covina" beats "covina", etc.
const CITY_DISTANCES = {
  'downtown los angeles': 1, 'dtla': 1, 'los angeles': 5,
  'west hollywood': 9, 'north hollywood': 12, 'hollywood': 8,
  'west covina': 21, 'covina': 22, 'glendale': 9, 'pasadena': 10,
  'south pasadena': 8, 'altadena': 13, 'woodland hills': 24, 'encino': 18,
  'sherman oaks': 15, 'studio city': 12, 'van nuys': 18, 'tarzana': 22,
  'northridge': 24, 'reseda': 22, 'canoga park': 25, 'burbank': 12,
  'santa monica': 16, 'venice': 17, 'culver city': 12, 'marina del rey': 15,
  'playa del rey': 16, 'inglewood': 12, 'beverly hills': 11, 'brentwood': 16,
  'bel air': 14, 'westwood': 14, 'long beach': 24, 'pomona': 30,
  'san gabriel': 11, 'alhambra': 8, 'monterey park': 9, 'arcadia': 14,
  'el monte': 14, 'baldwin park': 19, 'whittier': 18, 'downey': 13,
  'torrance': 20, 'redondo beach': 22, 'manhattan beach': 20, 'malibu': 30,
  'calabasas': 28, 'hawthorne': 15, 'gardena': 16, 'carson': 18,
  'compton': 14, 'bellflower': 18, 'norwalk': 18, 'la mirada': 22,
  'diamond bar': 28, 'walnut': 25, 'rowland heights': 25, 'hacienda heights': 22,
  'montebello': 10, 'pico rivera': 12, 'monrovia': 17, 'duarte': 20,
  'azusa': 24, 'glendora': 26, 'san dimas': 28, 'la verne': 30, 'claremont': 32,
  'chatsworth': 27, 'granada hills': 24, 'sylmar': 22, 'pacoima': 18,
  'sun valley': 15, 'la canada': 12, 'la crescenta': 13, 'temple city': 13,
  'rosemead': 11, 'south gate': 10, 'lynwood': 11, 'paramount': 16,
};
const DISTANCE_KEYS = Object.keys(CITY_DISTANCES).sort((a, b) => b.length - a.length);

function distanceFromDTLA(location) {
  if (!location) return null;
  const loc = String(location).toLowerCase();
  for (const city of DISTANCE_KEYS) {
    if (loc.includes(city)) return CITY_DISTANCES[city];
  }
  return null;
}

// DTLA City Hall coordinates
const DTLA = { lat: 34.0537, lng: -118.2427 };

// Straight-line miles, rounded — used when a listing has lat/lng (Airbnb).
// ~1.25x factor approximates driving distance over straight-line.
function distanceMiFromCoords(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const toRad = d => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius miles
  const dLat = toRad(lat - DTLA.lat);
  const dLng = toRad(lng - DTLA.lng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(DTLA.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const straight = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(straight * 1.25);
}

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
      distance_mi   REAL,
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
  // Migration for DBs created before distance_mi existed
  try { db.exec('ALTER TABLE listings ADD COLUMN distance_mi REAL'); } catch { /* already present */ }
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

// Airbnb fast scraper returns subtitles like ["8 beds", "6 bedrooms"]
function parseAirbnbSubtitles(subtitles) {
  let bedrooms = null, beds = null;
  if (Array.isArray(subtitles)) {
    for (const s of subtitles) {
      const bdM = String(s).match(/(\d+)\s*bedroom/i);
      if (bdM) bedrooms = +bdM[1];
      const bM = String(s).match(/(\d+)\s*beds?\b/i);
      if (bM && !/bedroom/i.test(s)) beds = +bM[1];
    }
  }
  return { bedrooms, beds };
}

// Airbnb title like "Home in City of Industry" → "City of Industry"
function areaFromAirbnbTitle(title) {
  if (!title) return '';
  const m = String(title).match(/\bin\s+(.+)$/i);
  return m ? m[1].trim() : String(title);
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

// Async pattern for slow actors: start run → poll status → fetch dataset.
// Needed when a run can exceed the 300s run-sync API cap (e.g. tri_angle Airbnb).
async function runApifyAsync(actorSlug, input, maxWaitMs = 540000) {
  try {
    console.log(`  → ${actorSlug} (async)`);
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${actorSlug}/runs?token=${APIFY_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
    );
    if (!startRes.ok) {
      console.error(`  [Apify] start HTTP ${startRes.status}:`, (await startRes.text()).slice(0, 200));
      return [];
    }
    const run = (await startRes.json()).data;
    const { id: runId, defaultDatasetId } = run;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 10000));
      const stRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const st = (await stRes.json()).data;
      if (st.status === 'SUCCEEDED') break;
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(st.status)) {
        console.error(`  [Apify] run ${st.status}`);
        return [];
      }
    }
    const dsRes = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`);
    return dsRes.ok ? await dsRes.json() : [];
  } catch (e) {
    console.error(`  [Apify] ${actorSlug} async failed:`, e.message);
    return [];
  }
}

async function discoverVrbo() {
  console.log('\n[Stage 1] VRBO');
  const items = await runApify('makework36~vrbo-scraper', {
    locations:    VRBO_LOCATIONS,
    checkIn:      TRIP.checkin,
    checkOut:     TRIP.checkout,
    adults:       TRIP.adults,
    maxResults:   VRBO_MAX_RESULTS,
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
    distance_mi: distanceFromDTLA(item.location || item.searchedLocation || ''),
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
  // Discover WITHOUT trip dates: far-future Aug 2026 + 16 guests returns 0
  // (availability not loaded), but undated search returns the full set plus a
  // representative 5-night total. Exact dated price comes from the card link /
  // Playwright. minBedrooms pushes the 7+ filter server-side.
  const items = await runApifyAsync('tri_angle~new-fast-airbnb-scraper', {
    locationQueries: AIRBNB_LOCATIONS,
    adults:          TRIP.adults,
    minBedrooms:     MIN_BEDROOMS,
    maxItems:        AIRBNB_MAX_ITEMS,
    currency:        'USD',
    locale:          'en-US',
  });
  console.log(`  Returned ${items.length} items`);

  const mapped = items
    .filter(item => item && item.id)   // guard: skip rows with no id (avoids PK collisions)
    .map(item => {
      const { bedrooms, beds } = parseAirbnbSubtitles(item.subtitles);
      const area   = areaFromAirbnbTitle(item.title) || item.name || '';
      const lat    = item.coordinates?.latitude;
      const lng    = item.coordinates?.longitude;
      const photos = Array.isArray(item.images) ? item.images.map(im => im.url).filter(Boolean) : [];
      const text   = `${item.name || ''} ${item.title || ''}`.toLowerCase();
      return {
        source:      'airbnb',
        listing_id:  String(item.id),
        name:        item.name || item.titleLocale || area || `Airbnb ${item.id}`,
        url:         `https://www.airbnb.com/rooms/${item.id}`,
        location:    area,
        distance_mi: distanceMiFromCoords(lat, lng) ?? distanceFromDTLA(area),
        bedrooms:    bedrooms,
        bathrooms:   parseBathroomsFromName(item.name),
        sleeps:      beds,
        amenities:   Array.isArray(item.badges) ? item.badges : [],
        photos,
        has_pool:    /\bpool\b/.test(text) ? 1 : 0,
        has_parking: /\b(parking|garage|driveway)\b/.test(text) ? 1 : 0,
        rating:      typeof item.rating?.average      === 'number' ? item.rating.average      : null,
        reviews:     typeof item.rating?.reviewsCount === 'number' ? item.rating.reviewsCount : null,
        price_total: parsePrice(item.pricing?.price || item.pricing?.label),
      };
    });

  // Region guard: the scraper sometimes bleeds in out-of-area results
  // (Houston, Atlantic City, etc.). Drop anything whose known coordinates put
  // it well outside greater LA. Keep rows with unknown distance (null).
  const REGION_MAX_MI = 70;  // ~1 hour drive from DTLA
  const inRegion = mapped.filter(r => r.distance_mi == null || r.distance_mi <= REGION_MAX_MI);
  const dropped = mapped.length - inRegion.length;
  if (dropped > 0) console.log(`  Dropped ${dropped} out-of-region listings (>${REGION_MAX_MI}mi from DTLA)`);
  return inRegion;
}

// ── Stage 2 — Upsert ──────────────────────────────────────────────────────────
function upsertAll(db, rows) {
  const today = new Date().toISOString().slice(0, 10);

  const upsertListing = db.prepare(`
    INSERT INTO listings
      (source, listing_id, name, url, location, bedrooms, bathrooms, sleeps,
       amenities, photos, has_pool, has_parking, rating, reviews, distance_mi)
    VALUES
      (@source, @listing_id, @name, @url, @location, @bedrooms, @bathrooms, @sleeps,
       @amenities, @photos, @has_pool, @has_parking, @rating, @reviews, @distance_mi)
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
      distance_mi = COALESCE(EXCLUDED.distance_mi, listings.distance_mi),
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

// Reuse a price snapshot if we already have a valid one within this many days,
// instead of re-rendering every listing with Playwright on every run.
const PRICE_TTL_DAYS = Number(process.env.PRICE_TTL_DAYS || 3);

async function fetchMissingPrices(db) {
  const today = new Date().toISOString().slice(0, 10);

  // Bedroom-passing listings that DON'T already have a valid price within the
  // TTL window. Anything priced recently is reused (Stage 3c reads the latest
  // snapshot), saving redundant Playwright renders.
  const candidates = db.prepare(`
    SELECT l.source, l.listing_id, l.bedrooms
    FROM listings l
    WHERE l.bedrooms >= ?
      AND NOT EXISTS (
        SELECT 1 FROM price_snapshots p
        WHERE p.source = l.source AND p.listing_id = l.listing_id
          AND p.price_total IS NOT NULL
          AND julianday(?) - julianday(p.run_date) < ?
      )
  `).all(MIN_BEDROOMS, today, PRICE_TTL_DAYS);

  if (!candidates.length) {
    console.log(`\n[Stage 3b] All bedroom-passing listings already priced within ${PRICE_TTL_DAYS} days`);
    return;
  }
  console.log(`\n[Stage 3b] Playwright price fetch for ${candidates.length} listings missing a price < ${PRICE_TTL_DAYS}d old`);

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
// Only listings seen in THIS run (last_seen >= runStart) are eligible, so
// listings that dropped out of today's results disappear instead of piling up.
function filterListings(db, runStart) {
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
    WHERE l.last_seen >= ?
  `).all(runStart);

  // Compute survivors first.
  const survivors = [];
  for (const r of rows) {
    if (!r.bedrooms || r.bedrooms < MIN_BEDROOMS) continue;
    if (r.price_total) {
      const est = estimateAllIn(r.price_total, r.source);
      if (est > BUDGET) continue;
    }
    survivors.push(r);
  }

  // Robustness: if this run produced no qualifying listings (Apify quota hit,
  // scraper error, etc.), keep the previous board rather than blanking the
  // site. Only swap in the new set when we actually have results.
  if (survivors.length === 0) {
    console.log('[Stage 3c] 0 qualifying listings this run — keeping previous board intact');
    return;
  }

  db.prepare('UPDATE listings SET passed_filter = 0').run();
  const pass = db.prepare('UPDATE listings SET passed_filter = 1 WHERE source=? AND listing_id=?');
  for (const r of survivors) pass.run(r.source, r.listing_id);
  console.log(`\n[Stage 3c] ${survivors.length} / ${rows.length} listings (this run) passed (beds >= ${MIN_BEDROOMS}, est ≤ $${BUDGET.toLocaleString()})`);
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
// ── Trip-scoped search (TRIP_ID env) ───────────────────────────────────────────
// Parameterized by a trip the user created in the app (destination/dates/guests/
// budget from data/trips.json). Searches that destination, caps results small for
// cost control, and writes the trip's own listings.json — the per-trip board.
// No SQLite, no Playwright: one cheap Airbnb search, fast feedback.
const LA_TRIP_ID = 'la-birthday-2026';

// General great-circle miles (×1.25 ≈ driving) between two lat/lng points.
function haversineMi(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number')) return null;
  const toRad = d => (d * Math.PI) / 180, R = 3958.8;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25);
}

// Ask Gemini for the 3 reference points of a destination (it knows world geography).
async function getRefPoints(destination) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt =
`For the travel destination "${destination}", give approximate coordinates for:
1) the downtown / city center
2) the primary airport serving it
3) the single most famous tourist attraction
Respond with JSON only: {"downtown":{"name":"","lat":0,"lng":0},"airport":{"name":"","lat":0,"lng":0},"attraction":{"name":"","lat":0,"lng":0}}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
      }),
    });
    const data = await r.json();
    if (!r.ok) { console.log('[ref-points] gemini', r.status); return null; }
    const txt = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    const j = JSON.parse(txt);
    const ok = p => p && typeof p.lat === 'number' && typeof p.lng === 'number';
    return (ok(j.downtown) || ok(j.airport) || ok(j.attraction)) ? j : null;
  } catch (e) { console.log('[ref-points] failed:', e.message); return null; }
}

// Distance chips from a listing's coords to each reference point.
function refDistances(lat, lng, refs) {
  if (!refs || typeof lat !== 'number' || typeof lng !== 'number') return [];
  const out = [];
  const add = (icon, p) => {
    if (p && typeof p.lat === 'number') {
      const mi = haversineMi(lat, lng, p.lat, p.lng);
      if (mi != null) out.push({ icon, label: p.name || '', mi });
    }
  };
  add('📍', refs.downtown);
  add('✈️', refs.airport);
  add('🎡', refs.attraction);
  return out;
}

async function runTripSearch(tripId) {
  const fs = require('fs');
  if (tripId === LA_TRIP_ID) {
    console.error('[trip-search] refusing to overwrite the LA trip (use the full pipeline)');
    process.exit(1);
  }
  const TRIPS_FILE = path.join(DATA_DIR, 'trips.json');
  let trips = {};
  try { trips = JSON.parse(fs.readFileSync(TRIPS_FILE, 'utf8')); } catch {}
  const trip = trips[tripId];
  if (!trip) { console.error(`[trip-search] trip ${tripId} not found`); process.exit(1); }

  const dir = path.join(DATA_DIR, 'trips', tripId);
  fs.mkdirSync(dir, { recursive: true });
  const marker = path.join(dir, '.searching');
  const listingsFile = path.join(dir, 'listings.json');

  const adults      = Number(trip.adults) || 8;
  const minBedrooms = trip.bedrooms ? Math.max(1, Number(trip.bedrooms)) : Math.max(1, Math.ceil(adults / 3));
  const maxBedrooms = minBedrooms + 4;            // keep results near the group's size (no 27BR mega-compounds)
  const finalCap    = Math.max(1, Number(process.env.TRIP_SEARCH_MAX || 10));
  const poolSize    = Math.max(30, finalCap * 4); // fetch a pool, then filter + rank + cap
  const homeType    = trip.home_type && trip.home_type !== 'Any' ? String(trip.home_type) : null;
  const budget      = Number(trip.budget) || 0;
  const taxRate     = trip.tax_rate != null ? Number(trip.tax_rate) : 0.14;
  const hotTubRe    = /\b(hot tub|hottub|jacuzzi|spa|whirlpool)\b/i;

  console.log(`[trip-search] ${tripId} — "${trip.destination}", ${adults} guests, ${minBedrooms}-${maxBedrooms}bd, type ${homeType || 'Any'}, cap ${finalCap}`);
  try { fs.writeFileSync(marker, new Date().toISOString()); } catch {}

  try {
    // The Airbnb scraper geocodes best on a plain city name — a ", State/Country"
    // suffix can break it (returns 0). Search on the city; Gemini still gets the
    // full destination for accurate reference points.
    const searchCity = String(trip.destination).split(',')[0].trim() || trip.destination;
    const actorInput = {
      locationQueries: [searchCity],
      adults,
      minBedrooms,
      maxItems: poolSize,
      currency: 'USD',
      locale:   'en-US',
    };
    // NOTE: this actor doesn't accept a propertyType filter (passing one returns 0
    // results), so home_type is kept as trip metadata and filtering is done via
    // min/max bedrooms + price ranking below. `homeType` retained for display.
    void homeType;
    // Search + geocode the destination's reference points (downtown/airport/attraction) in parallel.
    const [items, refs] = await Promise.all([
      runApifyAsync('tri_angle~new-fast-airbnb-scraper', actorInput),
      getRefPoints(trip.destination),
    ]);
    console.log(`[trip-search] returned ${items.length} items; ref-points ${refs ? 'ok' : 'none'}`);

    const mapped = items
      .filter(it => it && it.id)
      .map(it => {
        const { bedrooms, beds } = parseAirbnbSubtitles(it.subtitles);
        const area   = areaFromAirbnbTitle(it.title) || it.name || trip.destination;
        const photos = Array.isArray(it.images) ? it.images.map(im => im.url).filter(Boolean).slice(0, 8) : [];
        const text   = `${it.name || ''} ${it.title || ''}`.toLowerCase();
        const lat    = it.coordinates?.latitude;
        const lng    = it.coordinates?.longitude;
        const distances = refDistances(lat, lng, refs);
        const displayed = parsePrice(it.pricing?.price || it.pricing?.label);
        const est5n = displayed ? Math.round(displayed * (1 + taxRate)) : null;
        const tier = est5n == null ? 'unknown'
          : !budget                ? 'unknown'
          : est5n <= budget        ? 'under'
          : est5n <= budget * 1.1  ? 'marginal'
          : 'over';
        return {
          source:       'Airbnb',
          id:           String(it.id),
          url:          `https://www.airbnb.com/rooms/${it.id}`,
          name:         it.name || area || `Airbnb ${it.id}`,
          area,
          distance_mi:  distances.find(d => d.icon === '📍')?.mi ?? null,
          distances,
          bd:           bedrooms,
          ba:           parseBathroomsFromName(it.name),
          sleeps:       beds,
          pool:         /\bpool\b/.test(text) ? 'yes' : 'unknown',
          hot_tub:      hotTubRe.test(text) ? 'yes' : 'unknown',
          parking:      /\b(parking|garage|driveway)\b/.test(text) ? 'yes' : 'unknown',
          rating:       typeof it.rating?.average === 'number' ? it.rating.average : null,
          reviews:      typeof it.rating?.reviewsCount === 'number' ? it.rating.reviewsCount : null,
          photos,
          amenities:    Array.isArray(it.badges) ? it.badges : [],
          displayed_5n: displayed,
          est_5n:       est5n,
          est_4n:       est5n ? Math.round(est5n * 0.8) : null,
          budget:       tier,
          check_manual: true, // undated representative price — members verify
        };
      });

    // Keep homes near the group's size, then surface under-budget + cheapest first.
    const within = mapped.filter(l => l.bd == null || (l.bd >= minBedrooms && l.bd <= maxBedrooms));
    const pool = within.length >= Math.min(3, finalCap) ? within : mapped; // fall back if filter is too strict
    const tierRank = { under: 0, marginal: 1, unknown: 2, over: 3 };
    pool.sort((a, b) =>
      (tierRank[a.budget] - tierRank[b.budget]) ||              // under-budget first
      ((a.est_5n ?? Infinity) - (b.est_5n ?? Infinity)) ||      // then cheapest
      ((b.rating || 0) - (a.rating || 0))                      // then best-rated
    );
    const final = pool.slice(0, finalCap).map((l, i) => ({ rank: i + 1, ...l }));

    const tmp = `${listingsFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(final, null, 2));
    fs.renameSync(tmp, listingsFile);

    // Stamp refreshed_at on the trip record.
    try {
      const t2 = JSON.parse(fs.readFileSync(TRIPS_FILE, 'utf8'));
      if (t2[tripId]) {
        t2[tripId].refreshed_at = new Date().toISOString().slice(0, 10);
        if (refs) t2[tripId].ref_points = refs;
        fs.writeFileSync(TRIPS_FILE, JSON.stringify(t2, null, 2));
      }
    } catch {}

    console.log(`[trip-search] wrote ${final.length} listings → ${listingsFile}`);
  } finally {
    try { fs.unlinkSync(marker); } catch {}
  }
}

async function main() {
  if (!APIFY_TOKEN) { console.error('ERROR: APIFY_TOKEN required'); process.exit(1); }

  // Trip-scoped search mode: populate one user-created trip, then exit.
  if (process.env.TRIP_ID) {
    await runTripSearch(process.env.TRIP_ID);
    return;
  }

  const start = Date.now();
  // SQLite datetime('now') format, captured before discovery so every row
  // upserted this run gets last_seen >= RUN_START.
  const RUN_START = new Date().toISOString().slice(0, 19).replace('T', ' ');
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

  // Stage 3c — budget filter (only listings seen this run)
  filterListings(db, RUN_START);

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
