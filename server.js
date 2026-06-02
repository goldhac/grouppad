const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'la2026admin';

// Mutable data (votes/likes, member submissions, pipeline DB) lives in a
// persistent volume so it survives deploys/restarts. Static base data
// (listings.json, seed snapshot) stays bundled in the image.
const DATA_DIR = process.env.PIPELINE_DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

const DATA_FILE      = path.join(__dirname, 'data', 'listings.json'); // static base (image)
const VOTES_FILE     = path.join(DATA_DIR, 'votes.json');            // persisted
const SUBMITTED_FILE = path.join(DATA_DIR, 'submitted.json');        // persisted

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── File helpers ─────────────────────────────────────────────────────────────

function loadListings()  { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveListings(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

function loadVotes() {
  try { return JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8')); } catch { return {}; }
}
function saveVotes(v) { fs.writeFileSync(VOTES_FILE, JSON.stringify(v, null, 2)); }

function loadSubmitted() {
  try { return JSON.parse(fs.readFileSync(SUBMITTED_FILE, 'utf8')); } catch { return []; }
}
function saveSubmitted(l) { fs.writeFileSync(SUBMITTED_FILE, JSON.stringify(l, null, 2)); }

// ── Admin middleware ──────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const key = req.query.key || req.headers['x-admin-key'] || '';
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Wrong admin key' });
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
app.post('/api/submit', async (req, res) => {
  const { url, submitted_by, manual_price } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const parsed = parseListingUrl(url);
  if (!parsed)
    return res.status(400).json({ error: 'Please enter a valid http/https URL' });

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

  const entry = {
    id:            parsed.id,
    source:        parsed.source,
    url:           cleanUrl,
    name:          scraped.name,
    area:          scraped.area,
    distance_mi:   null,
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
const PIPELINE_REGION_MAX_MI = 150;
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

// ── Daily pipeline scheduler ──────────────────────────────────────────────────
// Runs pipeline.js once a day at PIPELINE_HOUR_UTC (default 15:00 UTC = 8am PDT).
// Self-rescheduling setTimeout so it survives indefinitely while the server is up.
const PIPELINE_HOUR_UTC = Number(process.env.PIPELINE_HOUR_UTC ?? 15);

function runPipelineJob() {
  if (!process.env.APIFY_TOKEN) {
    console.log('[Cron] Skipping pipeline run — APIFY_TOKEN not set');
    return;
  }
  const { spawn } = require('child_process');
  console.log('[Cron] Starting daily pipeline run…');
  const child = spawn('node', ['pipeline.js'], {
    cwd: __dirname, env: { ...process.env }, detached: true, stdio: 'ignore',
  });
  child.unref();
}

function scheduleDailyPipeline() {
  const now  = new Date();
  const next = new Date(now);
  next.setUTCHours(PIPELINE_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const delay = next - now;
  console.log(`[Cron] Next pipeline run at ${next.toISOString()} (in ${Math.round(delay / 3600000)}h)`);
  setTimeout(() => {
    runPipelineJob();
    scheduleDailyPipeline(); // reschedule for the following day
  }, delay);
}

app.listen(PORT, () => {
  console.log(`GroupPad listening on :${PORT}`);
  scheduleDailyPipeline();
});
