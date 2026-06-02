const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
// No insecure default: if ADMIN_KEY isn't set in the environment we generate a
// random ephemeral key, which effectively disables admin until it's configured
// (better than shipping a guessable hardcoded key on a public URL).
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(24).toString('hex');
if (!process.env.ADMIN_KEY) {
  console.warn('[admin] ADMIN_KEY not set — generated a random ephemeral key. Set ADMIN_KEY to enable admin features.');
}

// Mutable data (votes/likes, member submissions, pipeline DB) lives in a
// persistent volume so it survives deploys/restarts. Static base data
// (listings.json, seed snapshot) stays bundled in the image.
const DATA_DIR = process.env.PIPELINE_DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// The curated main list lives bundled in the image as a seed, but edits
// (admin deletes / re-ranks) are written to the persistent volume so they
// survive deploys. Read prefers the persisted copy, falling back to the seed.
const BASE_LISTINGS  = path.join(__dirname, 'data', 'listings.json'); // bundled seed
const LISTINGS_FILE  = path.join(DATA_DIR, 'listings.json');         // persisted, editable
const VOTES_FILE     = path.join(DATA_DIR, 'votes.json');            // persisted
const SUBMITTED_FILE = path.join(DATA_DIR, 'submitted.json');        // persisted
const ITINERARY_FILE = path.join(DATA_DIR, 'itinerary.json');        // persisted (admin)
const CAVEATS_FILE   = path.join(DATA_DIR, 'caveats.json');          // persisted (members)
const INSIGHTS_FILE  = path.join(DATA_DIR, 'insights.json');         // persisted (cached AI)

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── File helpers ─────────────────────────────────────────────────────────────

// Atomic write: write to a temp file then rename, so a crash mid-write can't
// corrupt the JSON and concurrent readers never see a half-written file.
function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function loadListings() {
  try { return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); }
  catch { return JSON.parse(fs.readFileSync(BASE_LISTINGS, 'utf8')); }
}
function saveListings(d) { writeJsonAtomic(LISTINGS_FILE, d); }

function loadVotes() {
  try { return JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8')); } catch { return {}; }
}
function saveVotes(v) { writeJsonAtomic(VOTES_FILE, v); }

function loadSubmitted() {
  try { return JSON.parse(fs.readFileSync(SUBMITTED_FILE, 'utf8')); } catch { return []; }
}
function saveSubmitted(l) { writeJsonAtomic(SUBMITTED_FILE, l); }

// Single canonical trip itinerary, posted by the admin. { text, updated_at }
function loadItinerary() {
  try { return JSON.parse(fs.readFileSync(ITINERARY_FILE, 'utf8')); } catch { return { text: '', updated_at: null }; }
}
function saveItinerary(it) { writeJsonAtomic(ITINERARY_FILE, it); }

// Member caveats: [{ id, name, text, created_at }]
function loadCaveats() {
  try { return JSON.parse(fs.readFileSync(CAVEATS_FILE, 'utf8')); } catch { return []; }
}
function saveCaveats(c) { writeJsonAtomic(CAVEATS_FILE, c); }

// Cached AI shortlist analysis, shared with everyone (one Gemini call per run).
function loadInsights() {
  try { return JSON.parse(fs.readFileSync(INSIGHTS_FILE, 'utf8')); } catch { return null; }
}
function saveInsights(i) { writeJsonAtomic(INSIGHTS_FILE, i); }

// ── Rate limiting (in-memory, per-IP) ──────────────────────────────────────────
// Protects the endpoints that cost real money (scraping on /submit, Gemini on
// /compare-listings) from being hammered. Good enough for a small group app.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || now > rec.reset) { rec = { count: 0, reset: now + windowMs }; hits.set(ip, rec); }
    rec.count++;
    if (rec.count > max) {
      const retry = Math.ceil((rec.reset - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Too many requests — try again in ${retry}s.` });
    }
    next();
  };
}

// ── SSRF guard ─────────────────────────────────────────────────────────────────
// Before fetching a user-supplied URL server-side, make sure it doesn't point at
// localhost / private / link-local / cloud-metadata addresses.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;            // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('::ffff:');
  }
  return false;
}
async function assertSafeUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https URLs allowed');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost'))
    throw new Error('Blocked host');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('Blocked private address');
  // Resolve DNS and reject if any resolved address is private (basic rebind guard).
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.some(a => isPrivateIp(a.address))) throw new Error('Blocked private address');
  } catch (e) {
    if (/Blocked/.test(e.message)) throw e;
    // DNS failure: let the fetch itself fail rather than hard-blocking.
  }
}

// ── Admin middleware ──────────────────────────────────────────────────────────
// Header-only (never the query string) so the key can't leak into access logs.
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || '';
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Wrong admin key' });
  next();
}

// ── URL parsing ───────────────────────────────────────────────────────────────

function parseListingUrl(rawUrl) {
  let urlObj;
  try { urlObj = new URL(rawUrl.trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(urlObj.protocol)) return null;
  const full = urlObj.toString();
  const ab = full.match(/airbnb\.com\/rooms\/(\d+)/);
  if (ab) return { source: 'Airbnb', id: ab[1] };
  const vb = full.match(/vrbo\.com\/(\d+)/);
  if (vb) return { source: 'VRBO', id: vb[1] };
  const bk = full.match(/booking\.com\/hotel\/[^/?#]+\/([^./?#]+)/);
  if (bk) return { source: 'Booking.com', id: bk[1] };
  // Any other valid rental URL — derive source from hostname, id from path
  const host   = urlObj.hostname.replace(/^www\./, '');
  const pathId = urlObj.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '-').slice(0, 100) || 'listing';
  return { source: host, id: pathId };
}

// ── Distance from Downtown LA (mirrors pipeline.js) ────────────────────────────
const DTLA = { lat: 34.0537, lng: -118.2427 };
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
  for (const city of DISTANCE_KEYS) if (loc.includes(city)) return CITY_DISTANCES[city];
  return null;
}
function distanceMiFromCoords(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return null;
  const toRad = d => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat - DTLA.lat), dLng = toRad(lng - DTLA.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(DTLA.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25);
}
// Pull lat/lng out of raw HTML when JSON-LD doesn't carry geo coordinates.
function extractLatLng(html) {
  const m = html.match(/"lat(?:itude)?"\s*:\s*(-?\d{1,2}\.\d{3,})\s*,\s*"l(?:ng|on|ongitude)"\s*:\s*(-?\d{2,3}\.\d{3,})/i);
  if (m) {
    const lat = +m[1], lng = +m[2];
    if (lat >= 32 && lat <= 36 && lng >= -120 && lng <= -116) return { lat, lng }; // sanity: SoCal box
  }
  return null;
}

// ── Scraper ───────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10000);
    const res  = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(tid);
    return res.ok ? await res.text() : '';
  } catch { return ''; }
}

function ogTag(html, prop) {
  const re = new RegExp(
    `<meta[^>]+property="og:${prop}"[^>]+content="([^"]+)"|<meta[^>]+content="([^"]+)"[^>]+property="og:${prop}"`, 'i'
  );
  const m = html.match(re);
  return m ? (m[1] || m[2]) : null;
}

function metaTag(html, name) {
  const re = new RegExp(
    `<meta[^>]+name="${name}"[^>]+content="([^"]+)"|<meta[^>]+content="([^"]+)"[^>]+name="${name}"`, 'i'
  );
  const m = html.match(re);
  return m ? (m[1] || m[2]) : null;
}

function extractJsonLd(html) {
  const results = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { results.push(JSON.parse(m[1])); } catch {}
  }
  return results;
}

function flattenJsonLd(nodes) {
  const out = [];
  for (const node of nodes) {
    if (Array.isArray(node['@graph'])) out.push(...node['@graph']);
    else out.push(node);
  }
  return out;
}

// Airbnb og:title: "Home in Los Angeles · ★4.67 · 7 bedrooms · 7 beds · 6.5 private baths"
function parseAirbnbTitle(title, result) {
  const parts = title.split('·').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return;

  // First segment: "Home in Los Angeles" or "Entire home in Los Angeles"
  result.name = parts[0];
  const areaM = parts[0].match(/\bin\s+(.+)$/i);
  if (areaM) result.area = areaM[1].trim();

  for (const part of parts.slice(1)) {
    if (!result.rating) {
      const rM = part.match(/^★([\d.]+)$/);
      if (rM) { result.rating = +rM[1]; continue; }
    }
    if (!result.bd) {
      const bdM = part.match(/^(\d+)\s*bedroom/i);
      if (bdM) { result.bd = +bdM[1]; continue; }
    }
    if (!result.ba) {
      const baM = part.match(/^([\d.]+)\s*(?:private\s+)?bath/i);
      if (baM) { result.ba = parseFloat(baM[1]); continue; }
    }
    if (!result.sleeps) {
      const slM = part.match(/^(\d+)\s*guests?$/i);
      if (slM) { result.sleeps = +slM[1]; continue; }
    }
  }
}

// VRBO og:title: "Property Name | 7 bedrooms, 5 baths, sleeps 16 | VRBO"
function parseVrboTitle(title, result) {
  const clean = title.replace(/\s*\|\s*vrbo\s*$/i, '').trim();
  const segs  = clean.split('|').map(s => s.trim()).filter(Boolean);
  if (segs[0]) result.name = segs[0];

  for (const seg of segs) {
    if (!result.bd) {
      const bdM = seg.match(/(\d+)\s*(?:bd|bedroom)/i);
      if (bdM) result.bd = +bdM[1];
    }
    if (!result.ba) {
      const baM = seg.match(/([\d.]+)\s*ba(?:th)?/i);
      if (baM) result.ba = parseFloat(baM[1]);
    }
    if (!result.sleeps) {
      const slM = seg.match(/sleeps?\s*(\d+)/i);
      if (slM) result.sleeps = +slM[1];
    }
  }
}

// Detect pool/parking from raw JSON patterns embedded in HTML
function detectAmenities(html, result) {
  if (result.pool === 'unknown') {
    if (/["'](?:Pool|Private pool|Swimming pool|Outdoor pool|Indoor pool)["']/i.test(html) ||
        /"(?:has_pool|private_pool|pool_available)"\s*:\s*true/i.test(html) ||
        /"pool"\s*:\s*(?:true|"yes")/i.test(html)) {
      result.pool = 'yes';
    }
  }
  if (result.parking === 'unknown') {
    if (/["'](?:Free parking|Paid parking|Driveway|Garage|Street parking|Parking available|Free street parking)["']/i.test(html) ||
        /"(?:has_parking|free_parking|parking_available)"\s*:\s*true/i.test(html)) {
      result.parking = 'yes';
    }
  }
}

// Extract review count from various JSON patterns in the HTML
function extractReviewCount(html) {
  const patterns = [
    /"reviewCount"\s*:\s*"?(\d+)"?/i,
    /"review_count"\s*:\s*(\d+)/i,
    /"reviewsCount"\s*:\s*(\d+)/i,
    /"ratingCount"\s*:\s*(\d+)/i,
    /"numberOfRatings"\s*:\s*(\d+)/i,
    /"numReviews"\s*:\s*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && +m[1] > 0) return +m[1];
  }
  return null;
}

function airbnbPhotosFromHtml(html) {
  const photos = [];
  const re   = /"(https?:\/\/a0\.muscache\.com\/im\/pictures\/[^"?]+\.jpeg)"/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); photos.push(m[1]); }
    if (photos.length >= 8) break;
  }
  return photos;
}

function vrboPhotosFromHtml(html) {
  const photos = [];
  const re   = /"(https?:\/\/media\.vrbo\.com\/lodging\/[^"?]+\.jpg)"/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); photos.push(m[1]); }
    if (photos.length >= 8) break;
  }
  return photos;
}

function extractPrice(html, source) {
  // Ordered from most-specific to least-specific
  const patterns = [
    // Airbnb SSR accessibility label: "$5,022 total" (appears in __NEXT_DATA__ when dates provided)
    { re: /"accessibilityLabel"\s*:\s*"\\?\$([\d,]+)(?:\.\d+)?\s+total"/i,     scale: 1 },
    // Airbnb: totalAmount.amount (JSON object form)
    { re: /"totalAmount"\s*:\s*\{\s*"[a-z]+"\s*:\s*(\d+(?:\.\d+)?)\s*\}/i,     scale: 1 },
    // Airbnb: amountMicros (divide by 1,000,000)
    { re: /"totalAmount"[^}]{0,80}"amountMicros"\s*:\s*"(\d+)"/i,               scale: 1e-6 },
    { re: /"total"[^}]{0,80}"amountMicros"\s*:\s*"(\d+)"/i,                     scale: 1e-6 },
    // Airbnb: flat totalAmount number
    { re: /"totalAmount"\s*:\s*(\d{4,6}(?:\.\d+)?)\b/,                          scale: 1 },
    // VRBO
    { re: /"totalRent"\s*:\s*(\d+(?:\.\d+)?)/i,                                 scale: 1 },
    { re: /"rentalAmount"\s*:\s*(\d+(?:\.\d+)?)/i,                              scale: 1 },
    { re: /"lodgingPrice"\s*:\s*\{\s*"[a-z]+"\s*:\s*(\d+(?:\.\d+)?)/i,         scale: 1 },
    // Generic: "$5,022 total" anywhere on page
    { re: /\$\s*([\d,]+(?:\.\d{2})?)\s+total\b/i,                               scale: 1 },
    // Generic: "$X,XXX for 5 nights"
    { re: /\$\s*([\d,]+)\s+for\s+5\s+nights?/i,                                 scale: 1 },
  ];

  for (const { re, scale } of patterns) {
    const m = html.match(re);
    if (m) {
      const val = Math.round(parseFloat(m[1].replace(/,/g, '')) * scale);
      if (val >= 1000 && val <= 150000) return val;
    }
  }
  return null;
}

const AB_KEY        = 'd306zoyjsyarp7ufs3il2wss7kmpq5fz';
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY || null;

// Try Airbnb's internal booking-details API — returns full price breakdown JSON
async function fetchAirbnbBookingPrice(listingId) {
  const endpoints = [
    // v2 booking details — sometimes returns total_price_formatted
    `https://www.airbnb.com/api/v2/pdp_listing_booking_details?adults=${TRIP.adults}` +
    `&check_in=${TRIP.checkin}&check_out=${TRIP.checkout}&currency=USD` +
    `&key=${AB_KEY}&listing_id=${listingId}&number_of_nights=5`,
    // v2 stays pricing quote
    `https://www.airbnb.com/api/v2/stays_pdp/price_quote?adults=${TRIP.adults}` +
    `&check_in=${TRIP.checkin}&check_out=${TRIP.checkout}&currency=USD` +
    `&key=${AB_KEY}&listing_id=${listingId}`,
  ];
  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 7000);
      const res  = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'X-Airbnb-API-Key': AB_KEY,
          'User-Agent': 'Airbnb/22.40 iPhone/16.0 Type/Phone',
          'Accept': 'application/json',
        },
      });
      clearTimeout(tid);
      if (!res.ok) continue;
      const body = await res.text();
      // Search JSON for total price fields
      const patterns = [
        /"total_price_formatted"\s*:\s*"\\?\$([\d,]+)"/i,
        /"total_price"\s*:\s*\{"amount"\s*:\s*(\d+(?:\.\d+)?)/i,
        /"totalAmount"\s*:\s*\{"[a-z]+"\s*:\s*(\d+(?:\.\d+)?)/i,
        /"total"\s*:\s*\{"amount"\s*:\s*(\d+(?:\.\d+)?)/i,
        /"amount"\s*:\s*(\d{4,6}(?:\.\d+)?)\b/,
      ];
      for (const p of patterns) {
        const m = body.match(p);
        if (m) {
          const val = Math.round(parseFloat(m[1].replace(/,/g, '')));
          if (val >= 1000 && val <= 150000) return { price: val, type: 'full' };
        }
      }
    } catch {}
  }
  return null;
}

// Playwright: renders the full page in headless Chromium, extracts price from the booking panel
async function fetchPriceWithPlaywright(cleanUrl, source) {
  let browser;
  try {
    const { chromium } = require('playwright-core');
    const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    });
    const ctx  = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    const dated = urlWithDates(cleanUrl, source);
    console.log('[Playwright] loading', dated);

    await page.goto(dated, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Airbnb: wait for the booking / price panel to appear
    if (source === 'Airbnb') {
      await page.waitForSelector(
        '[data-testid="book-it-default"], [data-plugin-in-point-id="BOOK_IT_SIDEBAR"], [data-section-id="BOOK_IT_SIDEBAR"]',
        { timeout: 15000 }
      ).catch(() => {});
    }

    // Give XHR/GraphQL calls time to resolve and price to render
    await page.waitForTimeout(6000);

    // Search visible text first — most reliable for user-facing price display
    const allText = await page.evaluate(() => document.body.innerText || '');
    const textPatterns = [
      /\$([\d,]+(?:\.\d{2})?)\s+total\b/i,
      /total\b[^$\n]{0,40}\$([\d,]+(?:\.\d{2})?)/i,
      /\$([\d,]+(?:\.\d{2})?)\s+for\s+5\s+nights?/i,
      /\$([\d,]+(?:\.\d{2})?)\s+for\s+4\s+nights?/i,
    ];
    for (const re of textPatterns) {
      const m = allText.match(re);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (val >= 1000 && val <= 200000) {
          console.log('[Playwright] found price in visible text:', val);
          return { price: Math.round(val), type: 'full' };
        }
      }
    }

    // Fall back to rendered HTML snapshot — catches embedded JSON data
    const rendered = await page.content();
    const htmlPrice = extractPrice(rendered, source);
    if (htmlPrice) {
      console.log('[Playwright] found price in rendered HTML:', htmlPrice);
      return { price: htmlPrice, type: 'full' };
    }

    console.log('[Playwright] no price found on page');
    return null;
  } catch (e) {
    console.error('[Playwright] error:', e.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Firecrawl v2: renders the page with a managed browser + uses LLM to extract price
async function fetchPriceViaFirecrawl(listingUrl) {
  if (!FIRECRAWL_KEY) return null;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 45000); // Firecrawl renders JS; can take ~15–25s
    const res  = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: listingUrl,
        formats: [{ type: 'question', question: 'What is the total price for the entire stay (all nights combined)? Return only a plain number in USD, no $ sign, no commas.' }],
        waitFor: 8000,
      }),
    });
    clearTimeout(tid);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Firecrawl] HTTP', res.status, errText.slice(0, 200));
      return null;
    }
    const data   = await res.json();
    const answer = data?.data?.question ?? data?.question ?? data?.data?.answers?.[0] ?? null;
    if (answer) {
      const numStr = String(answer).replace(/[$,\s]/g, '').match(/[\d.]+/)?.[0];
      if (numStr) {
        const price = Math.round(parseFloat(numStr));
        if (price >= 500 && price <= 200000) {
          console.log('[Firecrawl] found price:', price);
          return { price, type: 'full' };
        }
      }
    }
    console.log('[Firecrawl] no price in response:', JSON.stringify(data).slice(0, 300));
    return null;
  } catch (e) {
    console.error('[Firecrawl] exception:', e.message);
    return null;
  }
}

// Airbnb calendar API — nightly base rates only (no cleaning/service fees)
async function fetchAirbnbCalendarPrice(listingId) {
  try {
    const url = `https://www.airbnb.com/api/v2/calendar_months?currency=USD&key=${AB_KEY}` +
                `&listing_id=${listingId}&month=8&year=2026&count=1`;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)', 'X-Airbnb-Api-Key': AB_KEY },
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    const days       = data?.calendar_months?.[0]?.days || [];
    const checkDates = new Set(['2026-08-18','2026-08-19','2026-08-20','2026-08-21','2026-08-22']);
    let total = 0, found = 0;
    for (const d of days) {
      if (checkDates.has(d.date) && d.price?.native_amount) {
        total += d.price.native_amount;
        found++;
      }
    }
    return found === 5 ? { price: Math.round(total), type: 'nightly_only' } : null;
  } catch { return null; }
}

// Trip dates — fixed for Aug 18-23, 2026
const TRIP = { checkin: '2026-08-18', checkout: '2026-08-23', adults: 14 };

function urlWithDates(cleanUrl, source) {
  if (source === 'Airbnb') {
    return `${cleanUrl}?check_in=${TRIP.checkin}&check_out=${TRIP.checkout}&adults=${TRIP.adults}`;
  }
  if (source === 'VRBO') {
    return `${cleanUrl}?startDate=${TRIP.checkin}&endDate=${TRIP.checkout}&adults=${TRIP.adults}`;
  }
  return cleanUrl;
}

async function scrapeListingDetails(cleanUrl, parsed) {
  // Fetch with trip dates so the server returns price-specific HTML
  const html = await fetchHtml(urlWithDates(cleanUrl, parsed.source));

  const result = {
    name: null, area: 'Los Angeles area', photos: [],
    bd: null, ba: null, sleeps: null,
    rating: null, reviews: null,
    pool: 'unknown', parking: 'unknown',
    displayed_5n: null,
    lat: null, lng: null,
  };

  if (!html) return result;

  // ── Source-specific og:title parsing ──────────────────────────────────────
  const ogTitle = ogTag(html, 'title');
  if (ogTitle) {
    if (parsed.source === 'Airbnb') {
      parseAirbnbTitle(ogTitle, result);
    } else if (parsed.source === 'VRBO') {
      parseVrboTitle(ogTitle, result);
    } else {
      result.name = ogTitle.replace(/\s*[|·\-–—].*$/, '').trim();
    }
  }

  // og:image as first photo
  const ogImg = ogTag(html, 'image');
  if (ogImg && !result.photos.includes(ogImg)) result.photos.push(ogImg);

  // og:description / meta description for additional clues
  const desc = ogTag(html, 'description') || metaTag(html, 'description') || '';
  if (!result.bd)     { const m = desc.match(/(\d+)\s*bed(?:room)?s?/i);   if (m) result.bd     = +m[1]; }
  if (!result.ba)     { const m = desc.match(/(\d+(?:\.\d+)?)\s*bath/i);   if (m) result.ba     = +m[1]; }
  if (!result.sleeps) { const m = desc.match(/sleeps?\s*(\d+)/i);          if (m) result.sleeps = +m[1]; }
  if (result.area === 'Los Angeles area') {
    const m = desc.match(/\bin\s+([A-Z][^,.\n·]+)/);
    if (m) result.area = m[1].trim();
  }

  // ── JSON-LD ────────────────────────────────────────────────────────────────
  const nodes = flattenJsonLd(extractJsonLd(html));
  for (const node of nodes) {
    if (!result.name  && node.name)                  result.name   = String(node.name);
    if (!result.bd    && node.numberOfRooms)         result.bd     = +node.numberOfRooms || null;
    if (!result.ba    && node.numberOfBathroomsTotal) result.ba    = +node.numberOfBathroomsTotal || null;
    if (!result.sleeps && node.occupancy)            result.sleeps = +node.occupancy || null;

    if (node.amenityFeature) {
      const feats = Array.isArray(node.amenityFeature) ? node.amenityFeature : [node.amenityFeature];
      for (const f of feats) {
        const fname = (f.name || '').toLowerCase();
        const fval  = f.value;
        const yes   = fval === true || fval === 'True' || fval === 'true';
        const no    = fval === false || fval === 'False' || fval === 'false';
        if (fname.includes('pool'))    result.pool    = result.pool    === 'unknown' ? (yes ? 'yes' : no ? 'no' : 'unknown') : result.pool;
        if (fname.includes('park'))    result.parking = result.parking === 'unknown' ? (yes ? 'yes' : no ? 'no' : 'unknown') : result.parking;
        if (!result.bd && fname.includes('bedroom') && typeof fval === 'number')  result.bd = fval;
        if (!result.ba && fname.includes('bathroom') && typeof fval === 'number') result.ba = fval;
      }
    }

    if (!result.rating && node.aggregateRating) {
      result.rating  = +(+node.aggregateRating.ratingValue).toFixed(2) || null;
      result.reviews = +node.aggregateRating.reviewCount
        || +node.aggregateRating.ratingCount
        || null;
    }

    if (node.image) {
      const imgs = Array.isArray(node.image) ? node.image : [node.image];
      for (const img of imgs) {
        const u = typeof img === 'string' ? img : (img.url || img.contentUrl || '');
        if (u && !result.photos.includes(u)) result.photos.push(u);
        if (result.photos.length >= 8) break;
      }
    }

    if (node.address && result.area === 'Los Angeles area') {
      const a   = node.address;
      const loc = [a.addressLocality, a.addressRegion].filter(Boolean).join(', ');
      if (loc) result.area = loc;
    }

    if (result.lat == null && node.geo && node.geo.latitude != null) {
      const lat = +node.geo.latitude, lng = +node.geo.longitude;
      if (!isNaN(lat) && !isNaN(lng)) { result.lat = lat; result.lng = lng; }
    }
  }

  // Fall back to scraping coordinates straight out of the HTML.
  if (result.lat == null) {
    const geo = extractLatLng(html);
    if (geo) { result.lat = geo.lat; result.lng = geo.lng; }
  }

  // ── HTML-pattern scraping (photos, amenities, reviews) ────────────────────
  if (parsed.source === 'Airbnb') {
    for (const u of airbnbPhotosFromHtml(html)) {
      if (!result.photos.includes(u)) result.photos.push(u);
      if (result.photos.length >= 8) break;
    }
  } else if (parsed.source === 'VRBO') {
    for (const u of vrboPhotosFromHtml(html)) {
      if (!result.photos.includes(u)) result.photos.push(u);
      if (result.photos.length >= 8) break;
    }
  }

  detectAmenities(html, result);

  if (!result.reviews) result.reviews = extractReviewCount(html);

  // ── Price: HTML → Airbnb API → calendar → Playwright → Firecrawl ─────────
  const htmlPrice = extractPrice(html, parsed.source);
  if (htmlPrice) {
    result.displayed_5n    = htmlPrice;
    result.priceIsBaseOnly = false;
  } else {
    // 1. Try Airbnb internal APIs (both currently return 404 / empty — kept as cheap fast-path)
    let apiResult = null;
    if (parsed.source === 'Airbnb') {
      apiResult = await fetchAirbnbBookingPrice(parsed.id)
               || await fetchAirbnbCalendarPrice(parsed.id);
    }

    if (apiResult) {
      result.displayed_5n    = apiResult.price;
      result.priceIsBaseOnly = apiResult.type === 'nightly_only';
    } else {
      // 2. Playwright: render the full page with real headless Chrome so JS/GraphQL executes
      const pwResult = await fetchPriceWithPlaywright(cleanUrl, parsed.source);
      if (pwResult) {
        result.displayed_5n    = pwResult.price;
        result.priceIsBaseOnly = false;
      } else {
        // 3. Last resort: Firecrawl LLM extraction (uses Firecrawl's managed browser)
        const fcResult = await fetchPriceViaFirecrawl(urlWithDates(cleanUrl, parsed.source));
        if (fcResult) {
          result.displayed_5n    = fcResult.price;
          result.priceIsBaseOnly = false;
        }
      }
    }
  }

  result.photos = result.photos.slice(0, 8);
  if (!result.name) result.name = `${parsed.source} listing ${parsed.id}`;

  return result;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/listings', (req, res) => res.json(loadListings()));

app.get('/api/votes', (req, res) => res.json(loadVotes()));

app.post('/api/votes', (req, res) => {
  const { listing_id, voter, vote } = req.body || {};
  if (!listing_id || !voter || !['up', 'down', null].includes(vote))
    return res.status(400).json({ error: 'expected { listing_id, voter, vote: "up"|"down"|null }' });
  const votes = loadVotes();
  if (!votes[listing_id]) votes[listing_id] = {};
  if (vote === null) delete votes[listing_id][voter];
  else votes[listing_id][voter] = vote;
  saveVotes(votes);
  res.json(votes);
});

// Admin: verify key
app.get('/api/admin/verify', requireAdmin, (req, res) => res.json({ ok: true }));

// Admin: delete a main listing
app.delete('/api/listings/:id', requireAdmin, (req, res) => {
  const data = loadListings();
  const before = data.listings.length;
  data.listings = data.listings.filter(l => String(l.id) !== String(req.params.id));
  if (data.listings.length === before)
    return res.status(404).json({ error: 'Listing not found' });
  // Re-rank
  data.listings.forEach((l, i) => { l.rank = i + 1; });
  saveListings(data);
  res.json({ ok: true });
});

// Admin: delete a submitted listing
app.delete('/api/submitted/:id', requireAdmin, (req, res) => {
  const list = loadSubmitted();
  const before = list.length;
  const updated = list.filter(l => String(l.id) !== String(req.params.id));
  if (updated.length === before)
    return res.status(404).json({ error: 'Submission not found' });
  saveSubmitted(updated);
  res.json({ ok: true });
});

// Get community submissions
app.get('/api/submitted', (req, res) => res.json(loadSubmitted()));

// Submit a new listing
app.post('/api/submit', rateLimit({ windowMs: 60000, max: 5 }), async (req, res) => {
  const { url, submitted_by, manual_price } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const parsed = parseListingUrl(url);
  if (!parsed)
    return res.status(400).json({ error: 'Please enter a valid http/https URL' });

  // Guard against SSRF before we fetch the URL server-side.
  try { await assertSafeUrl(url); }
  catch (e) { return res.status(400).json({ error: e.message || 'URL not allowed' }); }

  // Dedup check against submitted
  const submitted = loadSubmitted();
  if (submitted.find(s => s.id === parsed.id && s.source === parsed.source))
    return res.status(409).json({ error: 'Already submitted' });

  // Dedup check against main listings
  const main = loadListings();
  if (main.listings.find(l => String(l.id) === String(parsed.id) && l.source === parsed.source))
    return res.status(409).json({ error: 'Already in the main list' });

  const cleanUrl = url.split('?')[0];
  const scraped  = await scrapeListingDetails(cleanUrl, parsed);
  const by       = (submitted_by || 'anonymous').slice(0, 60);

  // Manual price overrides auto-detection
  const manualVal = manual_price ? Math.round(+String(manual_price).replace(/[$,]/g, '')) : 0;
  if (manualVal >= 500 && manualVal <= 150000) {
    scraped.displayed_5n   = manualVal;
    scraped.priceIsBaseOnly = false;
  }

  // Estimate 5-night all-in price (Airbnb total already includes most fees; add 14% tax)
  let est5n = null;
  if (scraped.displayed_5n) {
    est5n = Math.round(scraped.displayed_5n * 1.14);
  }

  const budget = est5n == null ? 'unknown'
    : est5n <= main.trip.budget ? 'under'
    : est5n <= main.trip.budget * 1.1 ? 'marginal'
    : 'over';

  // Distance from DTLA: prefer scraped coordinates, else infer from the area/name.
  const distance_mi =
    distanceMiFromCoords(scraped.lat, scraped.lng) ??
    distanceFromDTLA(scraped.area) ??
    distanceFromDTLA(scraped.name);

  const entry = {
    id:            parsed.id,
    source:        parsed.source,
    url:           cleanUrl,
    name:          scraped.name,
    area:          scraped.area,
    distance_mi:   distance_mi,
    bd:            scraped.bd,
    ba:            scraped.ba,
    sleeps:        scraped.sleeps,
    pool:          scraped.pool,
    parking:       scraped.parking,
    rating:        scraped.rating,
    reviews:       scraped.reviews,
    displayed_5n:  scraped.displayed_5n,
    est_5n:        est5n,
    est_4n:        est5n ? Math.round(est5n * 0.8) : null,
    budget,
    check_manual:  true,
    photos:        scraped.photos,
    submitted_by:  by,
    submitted_at:  new Date().toISOString().slice(0, 10),
    note: est5n
      ? scraped.priceIsBaseOnly
        ? `Community submission by ${by}. Price shows base nightly rates only (excl. cleaning & service fees) — verify total at booking step.`
        : `Community submission by ${by}. Auto-detected price — verify total at booking step.`
      : `Community submission by ${by}. Price not auto-detected — check listing for pricing.`,
  };

  submitted.push(entry);
  saveSubmitted(submitted);
  res.json(entry);
});

// ── Pipeline listings (from SQLite) ──────────────────────────────────────────

const PIPELINE_DB = path.join(DATA_DIR, 'pipeline.db');              // persisted
const PIPELINE_SEED = path.join(__dirname, 'data', 'seed-listings.json'); // static (image)
const PIPELINE_BUDGET        = 7000;
const PIPELINE_TAX           = 0.14;
const PIPELINE_CLEANING_FEE  = 400;
const PIPELINE_REGION_MAX_MI = 70;  // ~1 hour drive from DTLA — prioritize big homes within range
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const HOT_TUB_RE = /\b(hot tub|hottub|jacuzzi|spa|whirlpool)\b/i;

function getPipelineDb() {
  try {
    const Database = require('better-sqlite3');
    return new Database(PIPELINE_DB, { readonly: true });
  } catch { return null; }
}

// Fallback snapshot: if the live DB is empty (fresh container, Apify quota hit,
// or a failed run), serve the last-known-good listings so the board is never
// blank. Live data overrides this whenever a scrape succeeds.
function loadSeedListings() {
  try {
    const raw = require('fs').readFileSync(PIPELINE_SEED, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : (j.listings || []);
  } catch { return []; }
}

app.get('/api/pipeline-listings', (req, res) => {
  const db = getPipelineDb();
  if (!db) {
    const seed = loadSeedListings();
    return res.json({ listings: seed, count: seed.length, note: 'Showing saved snapshot — pipeline DB unavailable' });
  }
  try {
    const rows = db.prepare(`
      SELECT
        l.source, l.listing_id, l.name, l.url, l.location,
        l.bedrooms, l.bathrooms, l.sleeps,
        l.amenities, l.photos,
        l.has_pool, l.has_parking,
        l.rating, l.reviews, l.distance_mi,
        l.enriched, l.last_seen,
        ps.price_total, ps.run_date
      FROM listings l
      LEFT JOIN price_snapshots ps ON (
        ps.source = l.source AND ps.listing_id = l.listing_id
        AND ps.run_date = (
          SELECT MAX(run_date) FROM price_snapshots
          WHERE source = l.source AND listing_id = l.listing_id
        )
      )
      WHERE l.passed_filter = 1
      ORDER BY
        CASE WHEN ps.price_total IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN l.has_pool = 1 THEN 0 ELSE 1 END,
        CASE WHEN l.has_parking = 1 THEN 0 ELSE 1 END,
        l.bedrooms DESC,
        l.rating DESC
    `).all();
    db.close();

    const listings = rows.map(r => {
      // Source-aware all-in: Airbnb totals already include the cleaning fee,
      // so only add tax; VRBO/other add a cleaning placeholder + tax.
      const est5n = r.price_total
        ? Math.round(
            (r.source === 'airbnb'
              ? r.price_total
              : r.price_total + PIPELINE_CLEANING_FEE) * (1 + PIPELINE_TAX)
          )
        : null;
      const budget = est5n == null ? 'unknown'
        : est5n <= PIPELINE_BUDGET              ? 'under'
        : est5n <= PIPELINE_BUDGET * 1.1        ? 'marginal'
        : 'over';
      return {
        id:           r.listing_id,
        source:       r.source,
        url:          r.url,
        name:         r.name,
        area:         r.location,
        bd:           r.bedrooms,
        ba:           r.bathrooms,
        sleeps:       r.sleeps,
        distance_mi:  r.distance_mi ?? null,
        pool:         r.has_pool    ? 'yes' : 'unknown',
        hot_tub:      HOT_TUB_RE.test(r.name || '') ? 'yes' : 'unknown',
        parking:      r.has_parking ? 'yes' : 'unknown',
        rating:       r.rating,
        reviews:      r.reviews,
        photos:       JSON.parse(r.photos  || '[]'),
        amenities:    JSON.parse(r.amenities || '[]'),
        displayed_5n: r.price_total || null,
        est_5n:       est5n,
        est_4n:       est5n ? Math.round(est5n * 0.8) : null,
        budget,
        check_manual: false,
        last_seen:    r.last_seen,
        enriched:     !!r.enriched,
      };
    });

    // Region guard at read time too (drops any out-of-area rows already in DB).
    const inRegion = listings.filter(l => l.distance_mi == null || l.distance_mi <= PIPELINE_REGION_MAX_MI);

    if (inRegion.length === 0) {
      const seed = loadSeedListings();
      return res.json({ listings: seed, count: seed.length, note: 'Showing saved snapshot — live refresh paused (Apify quota)' });
    }

    res.json({ listings: inRegion, count: inRegion.length });
  } catch (e) {
    if (db) db.close();
    console.error('[pipeline-listings]', e.message);
    const seed = loadSeedListings();
    res.json({ listings: seed, count: seed.length, note: 'Showing saved snapshot (read error)' });
  }
});

// ── AI compare (Gemini) ───────────────────────────────────────────────────────
// Body: { listings: [{name,bd,ba,sleeps,area,distance_mi,est_5n,pool,hot_tub,
//          parking,rating,reviews,url,amenities}], itinerary: "free text",
//          criteria?: "free text" }
// Returns: { analysis: "markdown text" }
app.post('/api/compare-listings', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI compare is not configured (GEMINI_API_KEY missing).' });
  }
  const { listings, criteria, mode } = req.body || {};
  if (!Array.isArray(listings) || listings.length < 2) {
    return res.status(400).json({ error: 'Pick at least 2 listings to compare.' });
  }
  const headToHead = mode === '1v1' && listings.length === 2;
  // Itinerary now comes from the single admin-posted source, not per-user uploads.
  const itinerary = loadItinerary().text || '';
  // Fold in member caveats so the AI weighs what the group actually cares about.
  const caveats = loadCaveats().slice(-30).map(c => `- ${c.name}: ${c.text}`).join('\n');

  // Compact each listing to the fields that matter, capped to keep the prompt small.
  const compact = listings.slice(0, 12).map((l, i) => ({
    n: i + 1,
    name: l.name,
    beds: l.bd, baths: l.ba, sleeps: l.sleeps,
    area: l.area, miFromDTLA: l.distance_mi,
    est_all_in_5n: l.est_5n, displayed_5n: l.displayed_5n,
    pool: l.pool === 'yes', hot_tub: l.hot_tub === 'yes', parking: l.parking === 'yes',
    rating: l.rating, reviews: l.reviews,
    highlights: Array.isArray(l.amenities) ? l.amenities.slice(0, 5) : [],
    url: l.url,
  }));

  const context =
`You are helping a group of 14 friends choose a large rental home for a 5-night LA birthday trip (Aug 18–23, 2026), budget ~$7,000 all-in. They prefer mansions / large homes and will accept locations up to ~1 hour from Downtown LA.

${itinerary ? `Their trip itinerary / plans (posted by the trip organizer):\n${String(itinerary).slice(0, 4000)}\n` : 'No itinerary was provided.'}
${caveats ? `Individual member caveats / must-haves:\n${caveats.slice(0, 1500)}\n` : ''}
${criteria ? `Extra criteria they care about:\n${String(criteria).slice(0, 1000)}\n` : ''}`;

  const prompt = headToHead
    ? `${context}
Head-to-head: compare these TWO homes (JSON):
${JSON.stringify(compact, null, 1)}

Write a punchy 1v1 markdown breakdown:
1. **Winner:** name the better pick in one bold line and why.
2. A tight table (Metric | Home 1 | Home 2) covering beds/sleeps, ~all-in price, distance from DTLA, pool, hot tub, parking, rating/reviews.
3. "Pick Home 1 if…" / "Pick Home 2 if…" — one line each.
Keep it under ~250 words. Refer to homes by number and name.`
    : `${context}
Here are the candidate listings (JSON):
${JSON.stringify(compact, null, 1)}

Write a concise, friendly comparison in markdown:
1. A short ranked recommendation (best fit first) with one-line reasons tied to their itinerary and group size.
2. A compact comparison table (Listing # | beds/sleeps | ~all-in | distance | pool/hot tub | standout).
3. Call out any red flags (too far for their planned activities, tight sleeping capacity for 14, over budget, low/no reviews).
Keep it under ~400 words. Refer to homes by their number and name.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // thinkingBudget:0 keeps 2.5-flash from spending the output budget on
        // internal reasoning (which was truncating the visible answer).
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[compare] Gemini error', r.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: data.error?.message || `Gemini HTTP ${r.status}` });
    }
    const analysis = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!analysis) return res.status(502).json({ error: 'Gemini returned no text.' });
    // Cache the full-shortlist analysis so everyone sees it without re-spending
    // on Gemini. 1v1 battles are ad-hoc and not cached.
    if (!headToHead) {
      // Record which listings were analyzed so the client can flag the insights
      // as stale once the shortlist changes.
      const ids = listings.map(l => String(l.id)).sort();
      saveInsights({ analysis, count: compact.length, ids, created_at: new Date().toISOString() });
    }
    res.json({ analysis });
  } catch (e) {
    console.error('[compare]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Admin: trigger a pipeline run (runs pipeline.js as a child process)
app.post('/api/admin/run-pipeline', requireAdmin, (req, res) => {
  const { spawn } = require('child_process');
  const env = { ...process.env };
  if (!env.APIFY_TOKEN) return res.status(400).json({ error: 'APIFY_TOKEN not set on server' });

  console.log('[Admin] Starting pipeline run…');
  const child = spawn('node', ['pipeline.js'], { cwd: __dirname, env, detached: true, stdio: 'ignore' });
  child.unref();
  res.json({ ok: true, message: 'Pipeline started in background — check server logs' });
});

// Latest cached AI shortlist analysis, shown to everyone.
app.get('/api/insights', (req, res) => res.json(loadInsights() || { analysis: '', created_at: null }));

// ── Trip itinerary (admin posts one canonical itinerary; everyone reads it) ─────
app.get('/api/itinerary', (req, res) => res.json(loadItinerary()));

app.post('/api/admin/itinerary', requireAdmin, (req, res) => {
  const text = String((req.body && req.body.text) || '').slice(0, 8000);
  const it = { text, updated_at: new Date().toISOString() };
  saveItinerary(it);
  res.json(it);
});

// ── Member caveats (small chat: each member adds their own must-haves) ──────────
app.get('/api/caveats', (req, res) => res.json(loadCaveats()));

app.post('/api/caveats', (req, res) => {
  const name = String((req.body && req.body.name) || 'Anon').slice(0, 40).trim() || 'Anon';
  const text = String((req.body && req.body.text) || '').slice(0, 500).trim();
  if (!text) return res.status(400).json({ error: 'Say something first.' });
  const list = loadCaveats();
  list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, text, created_at: new Date().toISOString() });
  const trimmed = list.slice(-200); // keep the log bounded
  saveCaveats(trimmed);
  res.json(trimmed);
});

app.delete('/api/caveats/:id', requireAdmin, (req, res) => {
  const list = loadCaveats();
  const updated = list.filter(c => c.id !== req.params.id);
  saveCaveats(updated);
  res.json(updated);
});

// ── Admin: Apify token usage (current month spend vs the $5 free cap) ───────────
app.get('/api/admin/apify-usage', requireAdmin, async (req, res) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) return res.status(400).json({ error: 'APIFY_TOKEN not set on server' });
  try {
    const [limitsR, runsR] = await Promise.all([
      fetch(`https://api.apify.com/v2/users/me/limits?token=${token}`),
      fetch(`https://api.apify.com/v2/actor-runs?token=${token}&limit=10&desc=1`),
    ]);
    const limits = await limitsR.json();
    const runs   = await runsR.json();
    const usage = limits?.data?.current?.monthlyUsageUsd
               ?? limits?.data?.monthlyUsageUsd
               ?? null;
    const limit = limits?.data?.limits?.maxMonthlyUsageUsd
               ?? limits?.data?.maxMonthlyUsageUsd
               ?? null;
    const recent = (runs?.data?.items || []).map(r => ({
      startedAt: r.startedAt,
      status: r.status,
      costUsd: r.usageTotalUsd ?? null,
      actId: r.actId,
    }));
    res.json({ usageUsd: usage, limitUsd: limit, recent });
  } catch (e) {
    console.error('[apify-usage]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── Pipeline scheduler ────────────────────────────────────────────────────────
// Runs pipeline.js every PIPELINE_INTERVAL_DAYS days at PIPELINE_HOUR_UTC.
// Default is WEEKLY (not daily): each run bills Apify, and the free tier is only
// $5/account/month — daily runs would blow that. Prices for an Aug trip barely
// move week-to-week this far out, so weekly is plenty. Self-rescheduling
// setTimeout so it survives indefinitely while the server is up.
const PIPELINE_HOUR_UTC     = Number(process.env.PIPELINE_HOUR_UTC ?? 15);
const PIPELINE_INTERVAL_DAYS = Math.max(1, Number(process.env.PIPELINE_INTERVAL_DAYS ?? 3));

function runPipelineJob() {
  if (!process.env.APIFY_TOKEN) {
    console.log('[Cron] Skipping pipeline run — APIFY_TOKEN not set');
    return;
  }
  const { spawn } = require('child_process');
  console.log('[Cron] Starting scheduled pipeline run…');
  const child = spawn('node', ['pipeline.js'], {
    cwd: __dirname, env: { ...process.env }, detached: true, stdio: 'ignore',
  });
  child.unref();
}

function schedulePipeline() {
  const now  = new Date();
  const next = new Date(now);
  next.setUTCHours(PIPELINE_HOUR_UTC, 0, 0, 0);
  while (next <= now) next.setUTCDate(next.getUTCDate() + PIPELINE_INTERVAL_DAYS);
  const delay = next - now;
  console.log(`[Cron] Next pipeline run at ${next.toISOString()} (in ${Math.round(delay / 3600000)}h, every ${PIPELINE_INTERVAL_DAYS}d)`);
  setTimeout(() => {
    runPipelineJob();
    schedulePipeline(); // reschedule for the following interval
  }, delay);
}

app.listen(PORT, () => {
  console.log(`GroupPad listening on :${PORT}`);
  schedulePipeline();
});
