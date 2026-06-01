const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'la2026admin';

const DATA_FILE      = path.join(__dirname, 'data', 'listings.json');
const VOTES_FILE     = path.join(__dirname, 'data', 'votes.json');
const SUBMITTED_FILE = path.join(__dirname, 'data', 'submitted.json');

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
  const url = rawUrl.trim();
  const ab = url.match(/airbnb\.com\/rooms\/(\d+)/);
  if (ab) return { source: 'Airbnb', id: ab[1] };
  const vb = url.match(/vrbo\.com\/(\d+)/);
  if (vb) return { source: 'VRBO', id: vb[1] };
  const bk = url.match(/booking\.com\/hotel\/[^/?#]+\/([^./?#]+)/);
  if (bk) return { source: 'Booking.com', id: bk[1] };
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
  if (source === 'Airbnb') {
    const m = html.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*(\d+(?:\.\d+)?)/);
    if (m) return Math.round(+m[1]);
  }
  const vb = html.match(/"(?:totalRent|rentalAmount|totalPrice|total_price)"\s*:\s*(\d+(?:\.\d+)?)/);
  if (vb) return Math.round(+vb[1]);
  const gen = html.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:total|for 5 nights|\/5 nights)/i);
  if (gen) return Math.round(parseFloat(gen[1].replace(/,/g, '')));
  return null;
}

async function scrapeListingDetails(cleanUrl, parsed) {
  const html = await fetchHtml(cleanUrl);

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

  // ── Price ─────────────────────────────────────────────────────────────────
  const rawPrice = extractPrice(html, parsed.source);
  if (rawPrice && rawPrice > 500 && rawPrice < 200000) result.displayed_5n = rawPrice;

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
  const { url, submitted_by } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const parsed = parseListingUrl(url);
  if (!parsed)
    return res.status(400).json({ error: 'URL must be from Airbnb, VRBO, or Booking.com' });

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

  // Estimate 5-night all-in price if we have a displayed price
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
      ? `Community submission by ${by}. Auto-detected price — verify at booking step.`
      : `Community submission by ${by}. Price not auto-detected — check listing for pricing.`,
  };

  submitted.push(entry);
  saveSubmitted(submitted);
  res.json(entry);
});

app.listen(PORT, () => console.log(`LA trip rentals listening on :${PORT}`));
