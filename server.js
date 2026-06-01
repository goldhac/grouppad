const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'listings.json');
const VOTES_FILE = path.join(__dirname, 'data', 'votes.json');
const SUBMITTED_FILE = path.join(__dirname, 'data', 'submitted.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadListings() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function loadVotes() {
  try { return JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8')); }
  catch { return {}; }
}

function saveVotes(votes) {
  fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2));
}

function loadSubmitted() {
  try { return JSON.parse(fs.readFileSync(SUBMITTED_FILE, 'utf8')); }
  catch { return []; }
}

function saveSubmitted(list) {
  fs.writeFileSync(SUBMITTED_FILE, JSON.stringify(list, null, 2));
}

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

async function tryFetchMeta(url) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
    });
    clearTimeout(tid);
    if (!res.ok) return { name: null, photo: null };
    const html = await res.text();
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
    const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    return {
      name: titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, '').trim() : null,
      photo: imgMatch ? imgMatch[1] : null,
    };
  } catch {
    return { name: null, photo: null };
  }
}

app.get('/api/listings', (req, res) => {
  res.json(loadListings());
});

app.get('/api/votes', (req, res) => {
  res.json(loadVotes());
});

app.post('/api/votes', (req, res) => {
  const { listing_id, voter, vote } = req.body || {};
  if (!listing_id || !voter || !['up', 'down', null].includes(vote)) {
    return res.status(400).json({ error: 'expected { listing_id, voter, vote: "up"|"down"|null }' });
  }
  const votes = loadVotes();
  if (!votes[listing_id]) votes[listing_id] = {};
  if (vote === null) delete votes[listing_id][voter];
  else votes[listing_id][voter] = vote;
  saveVotes(votes);
  res.json(votes);
});

app.get('/api/submitted', (req, res) => {
  res.json(loadSubmitted());
});

app.post('/api/submit', async (req, res) => {
  const { url, submitted_by } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const parsed = parseListingUrl(url);
  if (!parsed) {
    return res.status(400).json({ error: 'URL must be from Airbnb, VRBO, or Booking.com' });
  }

  const submitted = loadSubmitted();
  if (submitted.find(s => s.id === parsed.id && s.source === parsed.source)) {
    return res.status(409).json({ error: 'This listing has already been submitted' });
  }

  // Also check against the main listings so no duplicates
  const main = loadListings();
  if (main.listings.find(l => l.id === parsed.id && l.source === parsed.source)) {
    return res.status(409).json({ error: 'This listing is already in the main list' });
  }

  const meta = await tryFetchMeta(url.split('?')[0]);
  const by = (submitted_by || 'anonymous').slice(0, 60);
  const entry = {
    id: parsed.id,
    source: parsed.source,
    url: url.split('?')[0],
    name: meta.name || `${parsed.source} listing ${parsed.id}`,
    area: 'Los Angeles area',
    distance_mi: null,
    bd: null, ba: null, sleeps: null,
    pool: 'unknown', parking: 'unknown',
    rating: null, reviews: null,
    displayed_5n: null, est_5n: null, est_4n: null,
    budget: 'unknown',
    check_manual: true,
    photos: meta.photo ? [meta.photo] : [],
    submitted_by: by,
    submitted_at: new Date().toISOString().slice(0, 10),
    note: `Community submission by ${by}. Verify bedrooms, price, and availability manually.`,
  };

  submitted.push(entry);
  saveSubmitted(submitted);
  res.json(entry);
});

app.listen(PORT, () => {
  console.log(`LA trip rentals listening on :${PORT}`);
});
