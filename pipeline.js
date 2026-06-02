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
async function main() {
  if (!APIFY_TOKEN) { console.error('ERROR: APIFY_TOKEN required'); process.exit(1); }

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
