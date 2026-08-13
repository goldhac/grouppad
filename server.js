const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const Emails = require('./emails');

// Keys that would pollute Object.prototype if used to index a plain object.
const UNSAFE_KEY = /^(__proto__|constructor|prototype)$/;

const app = express();
// Trust exactly ONE proxy hop (Railway's LB). With `true`, a client could spoof
// X-Forwarded-For to forge a fresh source IP per request and defeat every rate
// limit; with a fixed hop count Express derives req.ip from the trusted entry.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
// No insecure default: if ADMIN_KEY isn't set in the environment we generate a
// random ephemeral key, which effectively disables admin until it's configured
// (better than shipping a guessable hardcoded key on a public URL).
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(24).toString('hex');
if (!process.env.ADMIN_KEY) {
  console.warn('[admin] ADMIN_KEY not set — generated a random ephemeral key. Set ADMIN_KEY to enable admin features.');
}

// Platform super-admins by email — these accounts get the admin dashboard without
// needing the key (just by being signed in). Configurable via SUPER_ADMIN_EMAILS.
const SUPER_ADMIN_EMAILS = new Set(
  (process.env.SUPER_ADMIN_EMAILS || '')   // configured via env, never hardcoded
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);
function isSuperAdmin(user) {
  return !!user && SUPER_ADMIN_EMAILS.has(String(user.email || '').toLowerCase());
}

// Mutable data (votes/likes, member submissions, pipeline DB) lives in a
// persistent volume so it survives deploys/restarts. Static base data
// (listings.json, seed snapshot) stays bundled in the image.
const DATA_DIR = process.env.PIPELINE_DATA_DIR || path.join(__dirname, 'data');
// Durability guard: in production the mutable store MUST live on the mounted
// persistent volume (PIPELINE_DATA_DIR), never inside the image at __dirname/data
// — that path is ephemeral and wiped on every deploy, silently taking every
// account, vote, and locked decision with it. Refuse to boot rather than run a
// data-losing config that looks fine until the next redeploy.
if (process.env.NODE_ENV === 'production' && DATA_DIR === path.join(__dirname, 'data')) {
  console.error('[data] FATAL: PIPELINE_DATA_DIR is not set in production — refusing to boot on the ephemeral image filesystem (data would be wiped on every deploy). Point it at the mounted Railway volume.');
  process.exit(1);
}
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
const USERS_FILE     = path.join(DATA_DIR, 'users.json');            // persisted (accounts)
const SESSIONS_FILE  = path.join(DATA_DIR, 'sessions.json');         // persisted (login sessions)
const MAGIC_FILE     = path.join(DATA_DIR, 'magic.json');            // persisted (pending magic links)
const FINALVOTES_FILE = path.join(DATA_DIR, 'finalvotes.json');      // persisted (each member's single top pick)
const DECISION_FILE   = path.join(DATA_DIR, 'decision.json');        // persisted (admin-locked final pick)
const USAGE_FILE      = path.join(DATA_DIR, 'usage.json');           // persisted (app-side API meter, by month)

// Security headers. Anti-clickjacking (X-Frame-Options), nosniff, HSTS, and a
// tightened Referrer-Policy, plus hiding X-Powered-By. CSP is intentionally OFF
// for now — a correct policy has to allow Google Fonts, PostHog, Google OAuth,
// and Airbnb/VRBO image CDNs, and shipping a wrong one silently breaks the app;
// tracked as a follow-up. COEP/CORP are relaxed because the app loads cross-origin
// images and fonts, and the OG image is fetched cross-origin by social scrapers.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 15552000, includeSubDomains: true },
}));

// Gzip/brotli every response (HTML, JS, CSS, JSON API payloads). Railway's proxy
// does not compress for us, so without this the client downloads ~3.5× the bytes.
// Must come before the static + API middleware so their output is compressed.
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => attachUser(req, res, next));
// Serve the compiled React client (Vite build) first; fall back to the legacy
// static `public/` assets for anything not produced by the build. The client
// uses HashRouter, so the server only ever needs to serve `/` → index.html.
//
// Cache policy: Vite emits content-hashed files under /assets/ (safe to cache
// forever — a change means a new filename), so mark those immutable. index.html
// must stay revalidated so a deploy's new asset hashes are picked up promptly.
// Other bundled statics (videos, og.jpg, favicon, manifest) get a modest TTL.
const setStaticCache = (res, filePath) => {
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
};
// Public runtime config injected into the SPA shell. This lets client-side keys
// (PostHog analytics/error-monitoring) be configured with a normal Railway
// variable — no rebuild to change, and nothing secret here (the PostHog *project*
// key is publishable by design). Built once at boot; empty key → client no-ops.
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');
const PUBLIC_CONFIG = {
  posthogKey: process.env.POSTHOG_KEY || '',
  posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
};
function buildIndexHtml() {
  try {
    const html = fs.readFileSync(path.join(CLIENT_DIST, 'index.html'), 'utf8');
    // Escape '<' so a value can't break out of the inline <script>.
    const cfg = JSON.stringify(PUBLIC_CONFIG).replace(/</g, '\\u003c');
    return html.replace('</head>', `<script>window.__PUBLIC_CONFIG__=${cfg};</script></head>`);
  } catch { return null; }
}
let INDEX_HTML = buildIndexHtml();
// Serve the injected shell for the SPA entry. HashRouter means only '/' (and a
// direct '/index.html') ever need the shell; deep links live in the '#' fragment.
app.get(['/', '/index.html'], (req, res, next) => {
  if (!INDEX_HTML) INDEX_HTML = buildIndexHtml();
  if (!INDEX_HTML) return next(); // dev without a build → fall through to static
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(INDEX_HTML);
});

app.use(express.static(path.join(__dirname, 'client', 'dist'), { setHeaders: setStaticCache }));
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: setStaticCache }));

// ── Scenario-specific link previews (Open Graph) ───────────────────────────────
// The app is a HashRouter SPA, so a crawler hitting a shared "#/..." link only
// ever sees the static index.html. These real (non-hash) /s/* routes give each
// share scenario its own preview card (invite, listing, board) with the trip's
// own photo + personalized text, then bounce humans to the in-app hash route.
// Cheap: no image rendering — og:image reuses a real listing/cover photo.
const ogEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const OG_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function ogDateRange(a, b) {
  if (!a) return '';
  const [ya, ma, da] = String(a).split('-').map(Number);
  if (!ma) return '';
  const start = `${OG_MON[ma - 1]} ${da}`;
  if (!b) return `${start}, ${ya}`;
  const [yb, mb, db] = String(b).split('-').map(Number);
  return `${start}–${ma === mb ? db : `${OG_MON[mb - 1]} ${db}`}, ${yb || ya}`;
}
// Build absolute URLs from the host the request actually arrived on, NOT the
// configured APP_BASE_URL — a link shared on the railway domain must point its
// og:image + redirect back at THAT domain (the configured custom domain may not
// be live, which silently breaks the preview image).
function reqBase(req) {
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : APP_BASE_URL;
}
function ogImage(url, base) {
  const b = base || APP_BASE_URL;
  if (!url) return `${b}/og.jpg`;
  if (/^https?:\/\//.test(url)) return url;
  return `${b}${url.startsWith('/') ? '' : '/'}${url}`;
}
function sharePage({ title, desc, image, canonical, redirect, fallbackImg }) {
  const dim = fallbackImg ? '\n<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : '';
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ogEsc(title)}</title>
<meta name="description" content="${ogEsc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GroupPad">
<meta property="og:title" content="${ogEsc(title)}">
<meta property="og:description" content="${ogEsc(desc)}">
<meta property="og:image" content="${ogEsc(image)}">${dim}
<meta property="og:url" content="${ogEsc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogEsc(title)}">
<meta name="twitter:description" content="${ogEsc(desc)}">
<meta name="twitter:image" content="${ogEsc(image)}">
<link rel="canonical" href="${ogEsc(canonical)}">
<meta http-equiv="refresh" content="0;url=${ogEsc(redirect)}">
<script>location.replace(${JSON.stringify(redirect)})</script>
</head><body style="font-family:system-ui;background:#10110f;color:#e7e0d0;display:grid;place-items:center;height:100vh;margin:0">Opening GroupPad…</body></html>`;
}
function boardHash(tripId, qs, base) { return `${base || APP_BASE_URL}/#/t/${encodeURIComponent(tripId)}/board${qs || ''}`; }

// "Your friend is inviting you to join this group trip"
app.get('/s/i/:tripId', (req, res) => {
  const base = reqBase(req);
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.redirect(302, `${base}/`);
  const code = String(req.query.c || trip.join_code || '');
  const facts = [trip.destination, ogDateRange(trip.checkin, trip.checkout_5n), trip.adults ? `${trip.adults} guests` : ''].filter(Boolean).join(' · ');
  // Invites lead with the branded GroupPad card (not a random home photo) so the
  // preview clearly reads as "you're being invited to GroupPad".
  res.set('Cache-Control', 'public, max-age=300').send(sharePage({
    title: `You're invited: ${trip.name}`,
    desc: `${facts ? facts + '. ' : ''}Browse the homes, vote on your favorites, and help the group pick one on GroupPad.`,
    image: ogImage('/og.jpg', base), fallbackImg: true,
    canonical: `${base}/s/i/${encodeURIComponent(trip.id)}`,
    redirect: boardHash(trip.id, code ? `?join=${encodeURIComponent(code)}` : '', base),
  }));
});

// "Your friend wants you to look at this listing"
app.get('/s/l/:tripId/:listingId', (req, res) => {
  const base = reqBase(req);
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.redirect(302, `${base}/`);
  const l = findListingByIdInTrip(trip.id, req.params.listingId);
  const name = (l && l.name) || 'this home';
  const specs = [l && l.bd && `${l.bd} bd`, l && l.sleeps && `sleeps ${l.sleeps}`, l && l.est_5n && `~$${Math.round(l.est_5n).toLocaleString('en-US')} all-in`, l && l.area].filter(Boolean).join(' · ');
  const photo = (l && Array.isArray(l.photos) && l.photos[0]) || tripCoverPhoto(trip.id);
  res.set('Cache-Control', 'public, max-age=300').send(sharePage({
    title: `Take a look: ${name}`,
    desc: `${specs ? specs + '. ' : ''}Part of ${trip.name}. Open it on GroupPad and tell the group what you think.`,
    image: ogImage(photo, base), fallbackImg: !photo,
    canonical: `${base}/s/l/${encodeURIComponent(trip.id)}/${encodeURIComponent(req.params.listingId)}`,
    redirect: boardHash(trip.id, `?listing=${encodeURIComponent(req.params.listingId)}`, base),
  }));
});

// General board share
app.get('/s/b/:tripId', (req, res) => {
  const base = reqBase(req);
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.redirect(302, `${base}/`);
  const facts = [trip.destination, ogDateRange(trip.checkin, trip.checkout_5n), trip.adults ? `${trip.adults} guests` : ''].filter(Boolean).join(' · ');
  const cover = tripCoverPhoto(trip.id);
  res.set('Cache-Control', 'public, max-age=300').send(sharePage({
    title: `${trip.name} on GroupPad`,
    desc: `${facts ? facts + '. ' : ''}See the homes the group is weighing, compare them with Scout, and add your vote.`,
    image: ogImage(cover, base), fallbackImg: !cover,
    canonical: `${base}/s/b/${encodeURIComponent(trip.id)}`,
    redirect: boardHash(trip.id, '', base),
  }));
});

// "This is my plan" — a member's personal itinerary as a real, self-contained
// page they can paste into the group chat. Unlike the other /s/* routes this
// RENDERS the content (it isn't a preview that bounces to the app), because the
// whole point is that people without the app can read it in the thread.
// Downloadable PDF of the same plan page. Rendered with the Chromium we already
// ship for scraping — no new dependency. MUST be registered before the HTML route
// below: Express's `:userId` would otherwise swallow the ".pdf" suffix.
// Falls back to a clear message (not a broken download) if Chromium is missing.
app.get('/s/plan/:tripId/:userId.pdf', rateLimit({ windowMs: 300000, max: 10 }), async (req, res) => {
  const { tripId } = req.params;
  const userId = String(req.params.userId || '');
  const trip = getTrip(tripId);
  const plan = trip && loadMyPlans(tripId)[userId];
  if (!plan) return res.status(404).send('No plan to export yet.');

  const url = `${reqBase(req)}/s/plan/${encodeURIComponent(tripId)}/${encodeURIComponent(userId)}?print=1`;
  let browser;
  try {
    const { chromium } = require('playwright-core');
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const pdf = await page.pdf({
      format: 'Letter', printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
    const who = (plan.owner_name || 'my').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${who}-plan-${tripId}.pdf"`,
      'Cache-Control': 'private, max-age=60',
    }).send(pdf);
  } catch (e) {
    console.error('[plan-pdf]', e.message);
    res.status(503).send('Could not build the PDF right now — open the plan page and use your browser\'s Print → Save as PDF.');
  } finally {
    try { await browser?.close(); } catch {}
  }
});

app.get('/s/plan/:tripId/:userId', (req, res) => {
  const base = reqBase(req);
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.redirect(302, `${base}/`);
  const plan = loadMyPlans(req.params.tripId)[req.params.userId];
  if (!plan) return res.redirect(302, boardHash(trip.id, '', base));
  const byId = new Map(loadExperiences(trip.id).map((x) => [String(x.id), x]));
  const who = plan.owner_name || 'A member';
  const dayName = (d) => {
    if (!d) return 'Any day';
    try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };
  let firstPhoto = null;
  const sections = plan.days.map((d) => {
    const items = d.items.map((it) => byId.get(String(it.id))).filter(Boolean);
    if (!items.length) return '';
    if (!firstPhoto) firstPhoto = items[0].photo;
    const thumb = (u) => (u && !u.includes('?') ? `${u}?im_w=240` : u);
    const li = items.map((x) => `<li class="it">
      ${x.photo ? `<img src="${ogEsc(thumb(x.photo))}" alt="" loading="lazy">` : '<span class="ph"></span>'}
      <span class="tx"><b>${ogEsc(x.title)}</b><small>${[x.price != null ? `$${x.price}/${x.priceUnit === 'group' ? 'group' : 'guest'}` : '', x.duration != null ? `${Math.round(x.duration / 60 * 10) / 10}h` : ''].filter(Boolean).join(' · ')}</small></span>
      <a class="go" href="${ogEsc(x.url)}" target="_blank" rel="noopener">Open</a></li>`).join('');
    return `<section><h2>${ogEsc(dayName(d.day))}</h2><ul>${li}</ul></section>`;
  }).join('');

  const title = `${who}'s plan for ${trip.name}`;
  const desc = `${who} put together a day-by-day plan of things to do in ${trip.destination}. See it and build your own on GroupPad.`;
  res.set('Cache-Control', 'public, max-age=120').send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ogEsc(title)}</title><meta name="description" content="${ogEsc(desc)}">
<meta property="og:type" content="website"><meta property="og:title" content="${ogEsc(title)}">
<meta property="og:description" content="${ogEsc(desc)}">
<meta property="og:image" content="${ogEsc(ogImage(firstPhoto, base))}">
<meta property="og:url" content="${base}/s/plan/${encodeURIComponent(trip.id)}/${encodeURIComponent(req.params.userId)}">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{color-scheme:dark;--bg:#121a18;--card:#182421;--line:#24322e;--tx:#eaf2ef;--mut:#9db3ac;--ac:#3fa88a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:28px 18px 60px}
.hd{margin-bottom:22px}.hd h1{font-size:24px;margin:0 0 4px}.hd p{margin:0;color:var(--mut);font-size:14px}
section{margin:0 0 18px}section h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--ac);margin:0 0 8px}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.it{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px}
.it img,.it .ph{width:52px;height:52px;border-radius:8px;object-fit:cover;flex:none;background:#20302b}
.tx{flex:1;min-width:0}.tx b{display:block;font-size:14.5px;font-weight:600}
.tx small{color:var(--mut);font-size:12.5px}
.go{flex:none;color:var(--ac);text-decoration:none;font-size:13px;font-weight:600;border:1px solid var(--line);padding:6px 11px;border-radius:8px}
.cta{display:block;margin-top:26px;text-align:center;background:var(--ac);color:#08120f;font-weight:700;text-decoration:none;padding:13px;border-radius:12px}
.ft{margin-top:14px;text-align:center;color:var(--mut);font-size:12px}
.tools{display:flex;gap:8px;justify-content:flex-end;margin-bottom:14px}
.tools a{color:var(--mut);text-decoration:none;font-size:12.5px;border:1px solid var(--line);padding:6px 11px;border-radius:8px}
/* Printing / PDF: ink-friendly light theme, no interactive chrome, never split a
   day across pages. Same markup, so the PDF matches what people see on the page. */
@media print{
  :root{color-scheme:light}
  body{background:#fff;color:#111}
  .wrap{max-width:none;padding:0}
  .it{background:#fff;border-color:#dcdcdc;break-inside:avoid}
  section{break-inside:avoid}
  section h2{color:#137a5f}
  .tx small{color:#555}
  .go,.cta,.tools{display:none!important}
  .hd p,.ft{color:#555}
}
</style></head><body><div class="wrap">
${req.query.print ? '' : `<div class="tools"><a href="${base}/s/plan/${encodeURIComponent(trip.id)}/${encodeURIComponent(req.params.userId)}.pdf">Download PDF</a><a href="javascript:window.print()">Print</a></div>`}
<div class="hd"><h1>${ogEsc(who)}&rsquo;s plan</h1><p>${ogEsc(trip.name)} · ${ogEsc(ogDateRange(trip.checkin, trip.checkout_5n))}</p></div>
${sections || '<p style="color:var(--mut)">No activities picked yet.</p>'}
${req.query.print ? '' : `<a class="cta" href="${boardHash(trip.id, '', base)}">Open the board &amp; build your own plan</a>`}
<p class="ft">Made with GroupPad · booking happens on Airbnb</p>
</div></body></html>`);
});

// ── File helpers ─────────────────────────────────────────────────────────────

// Atomic write: write to a temp file then rename, so a crash mid-write can't
// corrupt the JSON and concurrent readers never see a half-written file.
function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// ── Multi-trip storage ────────────────────────────────────────────────────────
// Each trip owns its own copy of every trip-scoped store. To keep the original
// single-trip ("LA") data exactly where it is — and migrate non-destructively —
// the LA trip reads/writes the legacy flat files in DATA_DIR, while every other
// trip lives under DATA_DIR/trips/<tripId>/. Every trip-scoped helper takes an
// optional tripId; omitting it (the old call sites) resolves to the LA trip, so
// all existing flat routes keep working unchanged.
const LA_TRIP_ID = 'la-birthday-2026';
const TRIPS_FILE = path.join(DATA_DIR, 'trips.json');

function tripDir(tripId) {
  if (!tripId || tripId === LA_TRIP_ID) return DATA_DIR; // legacy flat files = LA trip
  // Defense-in-depth: ids are server-generated as slug-hex ([a-z0-9-]). Reject anything
  // else so a caller that skipped the getTrip gate can never escape the data dir via
  // path traversal (e.g. tripId = "../../etc").
  if (!/^[a-z0-9-]+$/.test(tripId)) throw new Error('Invalid trip id');
  const d = path.join(DATA_DIR, 'trips', tripId);
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
}
function tripFile(tripId, name) { return path.join(tripDir(tripId), name); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function loadListings(tripId) {
  if (!tripId || tripId === LA_TRIP_ID) {
    try { return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); }
    catch { return JSON.parse(fs.readFileSync(BASE_LISTINGS, 'utf8')); }
  }
  // New trips carry no curated list — just their own (initially empty) array,
  // with trip metadata sourced from the registry.
  const listings = readJson(tripFile(tripId, 'listings.json'), []);
  const trip = getTrip(tripId) || {};
  return { trip, listings: Array.isArray(listings) ? listings : (listings.listings || []) };
}
function saveListings(d, tripId) {
  if (!tripId || tripId === LA_TRIP_ID) return writeJsonAtomic(LISTINGS_FILE, d);
  // Persist only the listings array for non-LA trips (meta lives in the registry).
  writeJsonAtomic(tripFile(tripId, 'listings.json'), d.listings || []);
}

function loadVotes(tripId)     { return readJson(tripFile(tripId, 'votes.json'), {}); }
function saveVotes(v, tripId)  { writeJsonAtomic(tripFile(tripId, 'votes.json'), v); }

// Experiences ("things to do") — scraped rows + their own votes store. Kept in a
// SEPARATE file from home votes so group-pulse "% voted" and the decision math
// never see experience ids.
function loadExperiences(tripId) {
  const rows = readJson(tripFile(tripId, 'experiences.json'), []);
  return Array.isArray(rows) ? rows : [];
}
function loadExpVotes(tripId)    { return readJson(tripFile(tripId, 'exp-votes.json'), {}); }
function saveExpVotes(v, tripId) { writeJsonAtomic(tripFile(tripId, 'exp-votes.json'), v); }

function loadSubmitted(tripId)    { return readJson(tripFile(tripId, 'submitted.json'), []); }
function saveSubmitted(l, tripId) { writeJsonAtomic(tripFile(tripId, 'submitted.json'), l); }

// Single canonical trip itinerary, posted by the organizer. { text, updated_at }
function loadItinerary(tripId)     { return readJson(tripFile(tripId, 'itinerary.json'), { text: '', updated_at: null }); }
function saveItinerary(it, tripId) { writeJsonAtomic(tripFile(tripId, 'itinerary.json'), it); }

// Member caveats: [{ id, user_id, name, text, created_at }]
function loadCaveats(tripId)    { return readJson(tripFile(tripId, 'caveats.json'), []); }
function saveCaveats(c, tripId) { writeJsonAtomic(tripFile(tripId, 'caveats.json'), c); }

// Cached AI shortlist analysis, shared with everyone (one Gemini call per run).
function loadInsights(tripId)    { return readJson(tripFile(tripId, 'insights.json'), null); }
function saveInsights(i, tripId) { writeJsonAtomic(tripFile(tripId, 'insights.json'), i); }
// The group's approved criteria changed → the cached Scout analysis no longer
// reflects what Scout would weigh. Flag it stale so the board prompts a re-run.
function markInsightsStale(tripId) {
  const i = loadInsights(tripId);
  if (i && !i.stale) { i.stale = true; saveInsights(i, tripId); }
}

// Final pick: each member's single top choice, plus the organizer-locked decision.
function loadFinalVotes(tripId)    { return readJson(tripFile(tripId, 'finalvotes.json'), {}); }
function saveFinalVotes(v, tripId) { writeJsonAtomic(tripFile(tripId, 'finalvotes.json'), v); }

// When someone leaves or is removed, their participation leaves with them: their
// likes (votes) and top-choice pick are purged. Their submitted listings STAY —
// the home is still a valid option for the group. Also reconciles any orphaned
// activity from members removed before this existed (sweep on boot).
function purgeNonMemberActivity(tripId) {
  const trip = getTrip(tripId);
  if (!trip) return;
  const members = new Set(trip.members || []);
  const votes = loadVotes(tripId); let vChanged = false;
  for (const lid of Object.keys(votes)) {
    const m = votes[lid] || {};
    for (const uid of Object.keys(m)) if (!members.has(uid)) { delete m[uid]; vChanged = true; }
    if (Object.keys(m).length === 0) { delete votes[lid]; vChanged = true; }
  }
  if (vChanged) saveVotes(votes, tripId);
  const fv = loadFinalVotes(tripId); let fChanged = false;
  for (const uid of Object.keys(fv)) if (!members.has(uid)) { delete fv[uid]; fChanged = true; }
  if (fChanged) saveFinalVotes(fv, tripId);
}
// Personal saved/favourite homes — per user, per trip ({ [userId]: listingId[] }).
function loadFavorites(tripId)     { return readJson(tripFile(tripId, 'favorites.json'), {}); }
function saveFavorites(f, tripId)  { writeJsonAtomic(tripFile(tripId, 'favorites.json'), f); }
function loadDecision(tripId)    { return readJson(tripFile(tripId, 'decision.json'), null); }
function saveDecision(d, tripId) { writeJsonAtomic(tripFile(tripId, 'decision.json'), d); }

// Cached review snippets per trip, keyed by `${source}:${id}` → { pos, neg, total,
// fetched_at }. Decoupled from listing storage so it works for curated, pipeline,
// and community listings alike. Scraped lazily (on detail-open) and cached hard.
function loadReviews(tripId)    { return readJson(tripFile(tripId, 'reviews.json'), {}); }
function saveReviews(m, tripId) { writeJsonAtomic(tripFile(tripId, 'reviews.json'), m); }

// Activity log per trip — the source for the daily email digest. [{ ts, type, text }]
function loadEvents(tripId) { return readJson(tripFile(tripId, 'events.json'), []); }
function logEvent(tripId, type, text) {
  try {
    const list = loadEvents(tripId);
    list.push({ ts: Date.now(), type, text: String(text || '').slice(0, 240) });
    writeJsonAtomic(tripFile(tripId, 'events.json'), list.slice(-500)); // bounded
  } catch (e) { console.error('[events] log failed:', e.message); }
}

// ── Trips registry (global) ───────────────────────────────────────────────────
// trips.json: { [tripId]: { id, name, destination, checkin, checkout_5n,
//   checkout_4n, adults, budget, tax_rate, cleaning_placeholder, owner_id,
//   members:[userId], join_code, created_at, refreshed_at } }
function loadTrips()  { return readJson(TRIPS_FILE, {}); }
function saveTrips(t) { writeJsonAtomic(TRIPS_FILE, t); }
function getTrip(id)  { return loadTrips()[id] || null; }

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'trip';
}
function createTrip(owner, f) {
  const trips = loadTrips();
  // Always append random entropy so the id is unguessable — the id itself is the
  // "view-by-link" secret (unlisted trips), while join_code gates participation.
  // 10 bytes = 80 bits: the slug is guessable (from the destination), so the suffix
  // is the real secret — 4 bytes (32 bits) was brute-forceable against the open
  // read routes; 80 bits makes enumeration infeasible. Existing shorter ids still work.
  const id = `${slugify(f.name || f.destination)}-${crypto.randomBytes(10).toString('hex')}`;
  const trip = {
    id,
    name: String(f.name || `${f.destination} trip`).slice(0, 80),
    destination: String(f.destination || '').slice(0, 80),
    checkin: f.checkin || null,
    checkout_5n: f.checkout_5n || f.checkout || null,
    checkout_4n: f.checkout_4n || null,
    adults: Number(f.adults) || 1,
    budget: Number(f.budget) || 0,
    bedrooms: f.bedrooms != null && f.bedrooms !== '' ? Math.max(1, Number(f.bedrooms)) : null,
    home_type: (f.home_type && String(f.home_type).trim()) || 'Any',
    // Date flexibility: how many days the group can shift each side of the dates.
    flex_days: f.flex_days != null && f.flex_days !== '' ? Math.min(14, Math.max(0, Number(f.flex_days) || 0)) : 0,
    tax_rate: f.tax_rate != null ? Number(f.tax_rate) : 0.14,
    cleaning_placeholder: f.cleaning_placeholder != null ? Number(f.cleaning_placeholder) : 0,
    owner_id: owner.id,
    members: [owner.id],
    join_code: crypto.randomBytes(9).toString('base64url'),
    created_at: new Date().toISOString(),
    refreshed_at: null,
  };
  trips[id] = trip;
  saveTrips(trips);
  return trip;
}
function addMember(tripId, userId) {
  const trips = loadTrips();
  const t = trips[tripId];
  if (!t) return null;
  if (!t.members.includes(userId)) { t.members.push(userId); saveTrips(trips); }
  return t;
}
// The trip CREATOR (can delete the trip + manage organizers). Stays fixed.
function isCreator(trip, user) { return !!user && !!trip && trip.owner_id === user.id; }
// An ORGANIZER = the creator OR anyone the creator/another organizer promoted.
// Organizers share every board power except deleting the trip.
function isOrganizer(trip, user) {
  return !!user && !!trip && (trip.owner_id === user.id || (Array.isArray(trip.organizers) && trip.organizers.includes(user.id)) || isSuperAdmin(user));
}
function isOwner(trip, user)  { return isOrganizer(trip, user); } // back-compat: "owner" UI = organizer powers
function isMember(trip, user) { return !!user && !!trip && Array.isArray(trip.members) && trip.members.includes(user.id); }
// A member-safe public view of a trip for a given caller (never leaks join_code
// unless the caller is the owner).
// Named UI skins (must match client ds2/themes.css). Validate organizer input
// so only a known value is ever stored / reflected into the DOM's data-skin.
const SKINS = new Set(['classic', 'tropical', 'coastal', 'sunset', 'pinksummer', 'forest']);
const cleanSkin = (s) => (SKINS.has(String(s)) ? String(s) : null);

// ── Trip lifecycle ────────────────────────────────────────────────────────────
// A trip is SETTLED once the group locked an official pick, and PAST once its
// checkout date has gone by. Either way it's DORMANT: nothing left to decide, so
// we stop refreshing listings (no scrape spend) and stop emailing members. Past
// trips are archived into "Previous trips" in the dashboard.
function tripCheckout(t) { return (t && (t.checkout_5n || t.checkout || t.checkout_4n)) || null; }
function isTripPast(t) {
  const co = tripCheckout(t);
  return !!co && String(co) < new Date().toISOString().slice(0, 10); // date-only compare
}
function isTripSettled(t) { return !!(t && loadDecision(t.id)); }
function isTripDormant(t) { return isTripPast(t) || isTripSettled(t); }

function tripView(trip, user) {
  if (!trip) return null;
  const { join_code, members, organizers, owner_id, ...rest } = trip;
  const organizer = isOrganizer(trip, user);
  // First name of the organizer, so an invited guest sees "Gold invited you"
  // (friendly context, no email/last name leaked).
  const ownerUser = owner_id ? loadUsers()[owner_id] : null;
  const owner_name = ownerUser && ownerUser.name ? String(ownerUser.name).trim().split(/\s+/)[0] : null;
  return {
    ...rest,
    owner_name,
    skin: cleanSkin(trip.skin) || 'classic', // the trip's UI theme (organizer-set)
    // isOwner stays the "organizer powers" flag the client gates on; isCreator
    // is the narrower creator-only flag (delete trip, manage organizers).
    isOwner: organizer,
    isCreator: isCreator(trip, user),
    isMember: isMember(trip, user),
    memberCount: Array.isArray(members) ? members.length : 0,
    // Lifecycle: past = dates gone (archived into "Previous trips"); settled =
    // official pick locked. Both stop refreshes + notifications.
    past: isTripPast(trip),
    settled: isTripSettled(trip),
    // Distance reference points (downtown/airport/attraction) so the client can
    // compute "X mi from …" on experiences (spec: experiences.md §4 Phase 2).
    // LA's live in the fixed LA_REFS constant; other trips carry their own.
    ref_points: tripRefPoints(trip.id) || null,
    // Organizers see the invite code, member list, owner id, and organizer list.
    ...(organizer ? { join_code, members, organizers: organizers || [], owner_id } : {}),
  };
}

// Pick a representative cover photo for a trip's dashboard card: the most
// up-voted home that has a photo, else the first home with a photo. Returns null
// when a trip has no photographed homes yet (new, submission-powered trips) — the
// client then falls back to an editorial placeholder.
function tripCoverPhoto(tripId) {
  try {
    const homes = [
      ...((loadListings(tripId).listings) || []),
      ...(loadSubmitted(tripId) || []),
    ].filter(l => Array.isArray(l.photos) && l.photos[0]);
    if (homes.length === 0) return null;
    const votes = loadVotes(tripId);
    const net = (l) => {
      const v = votes[l.id] || votes[String(l.id)] || {};
      let n = 0;
      for (const k in v) n += v[k] === 'up' ? 1 : v[k] === 'down' ? -1 : 0;
      return n;
    };
    let best = homes[0], bestNet = net(homes[0]);
    for (const h of homes) { const n = net(h); if (n > bestNet) { best = h; bestNet = n; } }
    return best.photos[0];
  } catch { return null; }
}

// One-time, non-destructive migration: if the trips registry is empty, register
// the original single-trip data as the LA trip. Its data files stay exactly where
// they are (DATA_DIR flat) because tripDir(LA_TRIP_ID) === DATA_DIR — nothing is
// moved or deleted. Runs at boot; no-op once the registry exists.
function migrateLegacyTripIfNeeded() {
  const trips = loadTrips();
  if (Object.keys(trips).length > 0) return;
  let base = {};
  try { base = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); }
  catch { try { base = JSON.parse(fs.readFileSync(BASE_LISTINGS, 'utf8')); } catch {} }
  const t = base.trip || {};
  const ownerEmail = process.env.OWNER_EMAIL || 'akporkofi11@gmail.com';
  const owner = findOrCreateUser(ownerEmail, 'Organizer');
  trips[LA_TRIP_ID] = {
    id: LA_TRIP_ID,
    name: t.destination ? `${t.destination} Group Trip` : 'LA Group Trip',
    destination: t.destination || 'Los Angeles',
    checkin: t.checkin || null,
    checkout_5n: t.checkout_5n || null,
    checkout_4n: t.checkout_4n || null,
    adults: t.adults || 14,
    budget: t.budget || 7000,
    tax_rate: t.tax_rate != null ? t.tax_rate : 0.14,
    cleaning_placeholder: t.cleaning_placeholder != null ? t.cleaning_placeholder : 0,
    owner_id: owner.id,
    members: [owner.id],
    join_code: crypto.randomBytes(9).toString('base64url'),
    created_at: new Date().toISOString(),
    refreshed_at: t.refreshed_at || null,
  };
  saveTrips(trips);
  console.log(`[migrate] registered legacy trip "${LA_TRIP_ID}" (owner ${owner.email})`);
}

// Idempotent repair: ensure the LA trip is owned by (and includes as a member)
// the account named in OWNER_EMAIL. The original migration guessed an owner email
// that didn't match the real Google login, orphaning the trip; this re-links it.
// Runs every boot, no-op once correct.
function ensureLaOwner() {
  const email = process.env.OWNER_EMAIL;
  if (!email) return;
  const trips = loadTrips();
  const la = trips[LA_TRIP_ID];
  if (!la) return;
  const owner = findOrCreateUser(email, 'Organizer');
  let changed = false;
  if (la.owner_id !== owner.id) { la.owner_id = owner.id; changed = true; }
  if (!Array.isArray(la.members)) la.members = [];
  if (!la.members.includes(owner.id)) { la.members.push(owner.id); changed = true; }
  if (changed) {
    saveTrips(trips);
    console.log(`[repair] LA trip owner re-linked to ${email}`);
  }
}

// Resolve :tripId → req.trip (404 if unknown). Read routes use this so anyone
// with the link can view; write routes add requireAuth + auto-join.
function loadTripOr404(req, res, next) {
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  req.trip = trip;
  next();
}
// Only the trip's creator may perform organizer actions on it.
function requireTripOwner(req, res, next) {
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.' });
  if (!isOrganizer(trip, req.user)) return res.status(403).json({ error: 'Only a trip organizer can do that.' });
  req.trip = trip;
  next();
}
// Stricter gate for creator-only actions (delete the trip, manage organizers).
function requireTripCreator(req, res, next) {
  const trip = req.trip || getTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.' });
  if (!isCreator(trip, req.user) && !isSuperAdmin(req.user)) return res.status(403).json({ error: 'Only the trip creator can do that.' });
  req.trip = trip;
  next();
}
// Participation (vote/submit/comment/etc.) requires actually being a member of
// THIS trip — joining is explicit via /join with the invite code. Without this,
// any signed-in user could act on any trip just by knowing its id.
function requireTripMember(req, res, next) {
  const trip = req.trip || getTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.' });
  if (trip.owner_id === req.user.id || isMember(trip, req.user) || isSuperAdmin(req.user)) { req.trip = trip; return next(); }
  return res.status(403).json({ error: 'Join this trip to take part.', needsJoin: true });
}

// App-side API meter. Google gives no per-key billing endpoint for Gemini, so we
// count calls + tokens ourselves; Firecrawl/Apify calls are counted too as a
// cross-check against each provider's own balance. Segmented by calendar month.
function usageMonth() { return new Date().toISOString().slice(0, 7); } // YYYY-MM
function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch { return {}; }
}
function bumpUsage(service, fields) {
  try {
    const u = loadUsage();
    const m = usageMonth();
    u[m] = u[m] || {};
    u[m][service] = u[m][service] || {};
    for (const [k, v] of Object.entries(fields)) {
      u[m][service][k] = (u[m][service][k] || 0) + (Number(v) || 0);
    }
    u[m].updated_at = new Date().toISOString();
    writeJsonAtomic(USAGE_FILE, u);
  } catch (e) { console.error('[usage] bump failed:', e.message); }
}

// ── Accounts (passwordless magic-link auth) ────────────────────────────────────
// users.json    : { [userId]: { id, email, name, created_at } }
// sessions.json : { [sessionId]: { user_id, created_at, expires_at } }
// magic.json    : { [tokenHash]: { email, expires_at } }   (one-time sign-in links)
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_TTL_MS   = 15 * 60 * 1000;           // 15 minutes
const SESSION_COOKIE = 'gp_session';

function loadUsers()    { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return {}; } }
function saveUsers(u)   { writeJsonAtomic(USERS_FILE, u); }
function loadSessions() { try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch { return {}; } }
function saveSessions(s){ writeJsonAtomic(SESSIONS_FILE, s); }
function loadMagic()    { try { return JSON.parse(fs.readFileSync(MAGIC_FILE, 'utf8')); } catch { return {}; } }
function saveMagic(m)   { writeJsonAtomic(MAGIC_FILE, m); }

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Find or create a user by email. For new users the display name defaults to
// the address local-part, unless a friendlier name is supplied (e.g. the name
// from a Google profile).
function findOrCreateUser(email, displayName) {
  const e = String(email).trim().toLowerCase();
  const users = loadUsers();
  let user = Object.values(users).find(u => u.email === e);
  if (!user) {
    const id = crypto.randomBytes(12).toString('hex');
    const name = String(displayName || '').trim().slice(0, 40) || e.split('@')[0].slice(0, 40);
    user = { id, email: e, name, created_at: new Date().toISOString() };
    users[id] = user;
    saveUsers(users);
  }
  return user;
}

function createSession(userId) {
  const sessions = loadSessions();
  const now = Date.now();
  // Opportunistically prune expired sessions so the file stays small.
  for (const [sid, s] of Object.entries(sessions)) if (s.expires_at < now) delete sessions[sid];
  const id = crypto.randomBytes(32).toString('hex');
  sessions[id] = { user_id: userId, created_at: now, expires_at: now + SESSION_TTL_MS };
  saveSessions(sessions);
  return id;
}

function userFromSession(sid) {
  if (!sid) return null;
  const sessions = loadSessions();
  const s = sessions[sid];
  if (!s || s.expires_at < Date.now()) return null;
  const users = loadUsers();
  return users[s.user_id] || null;
}

function setSessionCookie(req, res, sid) {
  const parts = [
    `${SESSION_COOKIE}=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(req, res) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// Populate req.user (or null) on every request from the session cookie.
function attachUser(req, res, next) {
  try { req.user = userFromSession(parseCookies(req)[SESSION_COOKIE]); }
  catch { req.user = null; }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.' });
  next();
}

// Send the magic link by email via Resend if configured; otherwise log it
// server-side (visible in deploy logs) so it can still be tested before the
// email provider is wired up. We never return the link in the HTTP response,
// since on a public URL that would let anyone log in as any email.
async function sendMagicLink(email, link) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // On a live deploy, NEVER print a working sign-in link to the logs — anyone with
    // log access could log in as any email. Fail closed; the caller returns a 502.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email delivery is not configured');
    }
    console.log(`[auth] (email not configured) magic link for ${email}: ${link}`);
    return { sent: false };
  }
  const from = process.env.MAIL_FROM || 'GroupPad <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [email], subject: 'Your GroupPad sign-in link',
      html: Emails.magicLink({ appBase: APP_BASE_URL, link }),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[auth] Resend send failed:', res.status, body.slice(0, 300));
    throw new Error('Could not send email');
  }
  return { sent: true };
}

// Alert the site manager (OWNER_EMAIL) — used for the Apify near-limit warning.
async function sendManagerEmail(subject, html) {
  const key = process.env.RESEND_API_KEY;
  const to  = process.env.OWNER_EMAIL;
  if (!key || !to) { console.log(`[alert] (email not configured) ${subject}`); return; }
  const from = process.env.MAIL_FROM || 'GroupPad <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) console.error('[alert] Resend send failed:', res.status);
  } catch (e) { console.error('[alert] send error:', e.message); }
}

// ── Member notifications (daily digest + instant alerts) ───────────────────────
// Where emails link back to. Set APP_BASE_URL in prod; defaults to the live URL.
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://exquisite-inspiration-production-7511.up.railway.app').replace(/\/+$/, '');
const boardUrl = (tripId) => `${APP_BASE_URL}/#/t/${tripId}/board`;

// Generic transactional send (member digests, instant alerts, invites).
// Returns true on success; never throws — email is best-effort.
// Bounded retry on TRANSIENT failures (429 rate-limit, 5xx, network blips). A
// dropped magic link is a silent login outage for that person, so it is worth a
// couple of extra seconds here. 4xx other than 429 is permanent (bad address,
// unverified domain) — retrying those just burns time.
async function sendEmail(to, subject, html, { attempts = 3 } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !isEmail(to)) { console.log(`[mail] (skipped) ${subject} → ${to}`); return false; }
  const from = process.env.MAIL_FROM || 'GroupPad <onboarding@resend.dev>';
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      if (res.ok) { if (i > 1) console.log(`[mail] sent on attempt ${i}: ${subject}`); return true; }
      const transient = res.status === 429 || res.status >= 500;
      console.error(`[mail] send failed (${res.status})${transient ? `, attempt ${i}/${attempts}` : ', permanent'}: ${subject}`);
      if (!transient) return false;
    } catch (e) {
      console.error(`[mail] send error (attempt ${i}/${attempts}): ${e.message}`);
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 400 * 2 ** (i - 1))); // 400ms, 800ms
  }
  return false;
}

// Per-user prefs live on the user record: { notif:{digest,instant}, unsub }.
// Opt-out model — both default ON until the user unsubscribes.
function notifPrefs(user) {
  const n = (user && user.notif) || {};
  return { digest: n.digest !== false, instant: n.instant !== false };
}
// Lazily mint (and persist) a stable unsubscribe token for one user.
function unsubToken(userId) {
  const users = loadUsers();
  const u = users[userId];
  if (!u) return null;
  if (!u.unsub) { u.unsub = crypto.randomBytes(16).toString('hex'); saveUsers(users); }
  return u.unsub;
}
// Resolve a trip's members to emailable recipients (joins users.json), minting
// unsubscribe tokens in a single pass.
function tripRecipients(trip) {
  if (!trip) return [];
  const users = loadUsers();
  let dirty = false;
  const out = [];
  for (const id of (trip.members || [])) {
    const u = users[id];
    if (!u || !isEmail(u.email)) continue;
    if (!u.unsub) { u.unsub = crypto.randomBytes(16).toString('hex'); dirty = true; }
    out.push({ id: u.id, email: u.email, name: u.name || u.email.split('@')[0], prefs: notifPrefs(u), unsub: u.unsub });
  }
  if (dirty) saveUsers(users);
  return out;
}

// Signature of the homes the board actually shows for a trip — used to detect a
// REAL change before emailing. LA's board is served from the pipeline DB; other
// trips from their own listings file. (getPipelineDb/loadSeedListings are
// declared later but hoisted.)
function listingSignature(tripId) {
  let ids = [];
  if (tripId === LA_TRIP_ID) {
    const db = getPipelineDb();
    if (db) {
      try { ids = db.prepare('SELECT source, listing_id FROM listings WHERE passed_filter=1').all().map((r) => `${r.source}:${r.listing_id}`); }
      catch { /* old schema — ignore */ }
      try { db.close(); } catch { /* ignore */ }
    }
  } else {
    ids = (((loadListings(tripId) || {}).listings) || []).map((l) => String(l.id || l.url || '')).filter(Boolean);
  }
  ids.sort();
  return { count: ids.length, sig: crypto.createHash('sha1').update(ids.join('|')).digest('hex') };
}

// After a refresh: stamp board freshness, and email members — but ONLY when the
// actual set of homes changed since the last notice. First run sets a silent
// baseline (no email), so a no-op refresh never fires a false "fresh homes" blast.
function notifyFreshHomes(tripId) {
  try {
    const { count, sig } = listingSignature(tripId);
    if (!count) return; // empty board — nothing to announce
    const trips = loadTrips();
    const trip = trips[tripId];
    if (!trip) return;
    // Decided or past — new homes are no longer news. Keep the board fresh but
    // stop emailing about it (the decision email is the last one).
    if (isTripDormant(trip)) {
      trip.refreshed_at = new Date().toISOString().slice(0, 10);
      saveTrips(trips);
      logEvent(tripId, 'refresh', `Listings refreshed — ${count} homes (decision locked, members not emailed)`);
      return;
    }
    trip.refreshed_at = new Date().toISOString().slice(0, 10); // accurate board freshness
    const firstTime = trip.last_fresh_sig === undefined;
    const changed = trip.last_fresh_sig !== sig;
    trip.last_fresh_sig = sig;
    saveTrips(trips);
    if (firstTime || !changed) {
      logEvent(tripId, 'refresh', `Listings refreshed — ${firstTime ? 'baseline set' : 'no change'} (${count} homes)`);
      return; // never blast on the first run (no baseline) or a no-op refresh
    }
    const recips = tripRecipients(trip).filter((r) => r.prefs.digest);
    for (const r of recips) {
      const html = Emails.freshHomes({ appBase: APP_BASE_URL, tripName: trip.name, count, boardUrl: boardUrl(tripId), unsub: r.unsub });
      sendEmail(r.email, `Fresh homes on ${trip.name}`, html).catch(() => {});
    }
    logEvent(tripId, 'refresh', `Fresh homes — ${count}, notified ${recips.length}`);
  } catch (e) { console.error('[freshHomes] failed:', e.message); }
}
// Find a listing (curated or community) by id within a trip — to name the pick.
function findListingByIdInTrip(tripId, id) {
  const sid = String(id);
  const main = (loadListings(tripId).listings || []).find(l => String(l.id) === sid);
  return main || (loadSubmitted(tripId).find(l => String(l.id) === sid) || null);
}

// Premium email templates live in ./emails (also used by the preview script).

// Instant alert: a participant just joined → tell the organizer.
function noteJoin(tripId, user) {
  if (!tripId || !user) return;
  const trip = getTrip(tripId);
  if (!trip) return;
  const wasMember = Array.isArray(trip.members) && trip.members.includes(user.id);
  addMember(tripId, user.id);
  if (wasMember || trip.owner_id === user.id) return; // not a new join
  // Tell everyone already on the trip (not just the organizer) — the group
  // sees their party growing. Skip the person who just joined.
  const fresh = getTrip(tripId);
  const memberCount = (fresh?.members || []).length;
  const who = user.name || 'Someone';
  const recips = tripRecipients(fresh).filter((r) => r.prefs.instant && r.id !== user.id);
  for (const r of recips) {
    const html = Emails.joined({
      appBase: APP_BASE_URL, tripName: trip.name, who,
      boardUrl: boardUrl(tripId), unsub: r.unsub, memberCount,
    });
    sendEmail(r.email, `${who} joined ${trip.name}`, html).catch(() => {});
  }
}

// Instant alert: the organizer locked the final pick → tell every member.
async function emailDecisionLocked(tripId, listingId, actorId) {
  const trip = getTrip(tripId);
  if (!trip) return;
  const listing = findListingByIdInTrip(tripId, listingId);
  const name = (listing && listing.name) || 'the final pick';
  // Enrich the "official pick" email with the listing's photo + priced split.
  const usd = (n) => (n != null ? '$' + Math.round(n).toLocaleString('en-US') : undefined);
  const split = trip.adults || (trip.members || []).length || 1;
  const specs = [listing?.bd && `${listing.bd} bed`, listing?.ba && `${listing.ba} bath`, listing?.sleeps && `sleeps ${listing.sleeps}`].filter(Boolean).join(' · ') || undefined;
  const rich = {
    photo: listing?.photos?.[0] || undefined,
    area: listing?.area || undefined,
    specs,
    est5n: usd(listing?.est_5n),
    perPerson: listing?.est_5n != null ? usd(Math.ceil(listing.est_5n / split)) : undefined,
    organizer: (loadUsers()[actorId] || {}).name || undefined,
    // Take them straight to the home they won (primary CTA in the email).
    listingUrl: listing?.url || undefined,
    source: listing?.source || undefined,
  };
  // Everyone on the trip gets the result — including the organizer who locked it
  // (it's the record of the decision, with the booking link).
  const recips = tripRecipients(trip).filter((r) => r.prefs.instant);
  for (const r of recips) {
    const html = Emails.decisionLocked({
      appBase: APP_BASE_URL, tripName: trip.name, listingName: name,
      boardUrl: boardUrl(tripId), unsub: r.unsub, ...rich,
    });
    await sendEmail(r.email, `It's official: ${name} — ${trip.name}`, html);
  }
  if (recips.length) console.log(`[notify] decision-locked → ${recips.length} member(s) on ${tripId}`);
}

// ── Review snippets (lazy, cached) ─────────────────────────────────────────────
// Run an Apify actor synchronously and return its dataset items (or null). Slugs
// use the vendor~name form. Counts toward the app-side usage meter.
async function runApifyActor(slug, input, timeoutMs = 120000) {
  const token = getApifyToken();
  if (!token) return null;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[reviews] apify ${slug} ${res.status}`);
      // 401/403 = key invalid/expired/over-credit → alert the owner.
      if (res.status === 401 || res.status === 402 || res.status === 403) noteApifyDown(`actor ${slug}`, `HTTP ${res.status}`);
      return null;
    }
    const items = await res.json();
    bumpUsage('apify', { calls: 1, results: Array.isArray(items) ? items.length : 0 });
    return Array.isArray(items) ? items : [];
  } catch (e) { console.error(`[reviews] apify ${slug} error:`, e.message); return null; }
  finally { clearTimeout(to); }
}

// Normalize + split raw reviews into newest-first positive (≥4★) / negative (≤3★).
function shapeReviews(raw) {
  const norm = (raw || [])
    .map(r => ({
      text: String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      rating: Number.isFinite(+r.rating) ? +r.rating : null,
      date: r.date ? String(r.date).slice(0, 40) : null,
      author: String(r.author || '').slice(0, 40),
    }))
    .filter(r => r.text);
  return {
    pos: norm.filter(r => (r.rating ?? 5) >= 4).slice(0, 4),
    neg: norm.filter(r => (r.rating ?? 5) <= 3).slice(0, 4),
    total: norm.length,
    fetched_at: new Date().toISOString(),
  };
}

// Fetch review text for one listing via the platform-appropriate Apify actor.
// Returns a shaped object, or null if the source is unsupported / the run failed.
async function fetchListingReviews(source, url, max = 20) {
  if (!url) return null;
  const s = String(source || '').toLowerCase();
  if (s.includes('airbnb')) {
    // Pull most-recent (fills the "loved it" column) AND lowest-rated (so real
    // "concerns" surface even on a 4.9★ home) — then merge + dedupe.
    const [recent, worst] = await Promise.all([
      runApifyActor('tri_angle~airbnb-reviews-scraper', { startUrls: [{ url }], maxReviewsPerListing: max, sortBy: 'most-recent' }),
      runApifyActor('tri_angle~airbnb-reviews-scraper', { startUrls: [{ url }], maxReviewsPerListing: 8, sortBy: 'lowest-rated' }),
    ]);
    if (recent == null && worst == null) return null;
    const seen = new Set();
    const merged = [...(recent || []), ...(worst || [])]
      .map(it => ({ text: it.text ?? it.localizedText, rating: it.rating, date: it.createdAt, author: it.reviewer?.firstName ?? it.reviewerName, _k: it.id }))
      .filter(it => { const k = it._k || it.text; if (!it.text || seen.has(k)) return false; seen.add(k); return true; });
    return shapeReviews(merged);
  }
  if (s.includes('vrbo')) {
    // VRBO actively blocks scrapers, so this is best-effort. shahidirfan's actor
    // (free) is the most reliable; it returns a rating LABEL, not a star number.
    const items = await runApifyActor('shahidirfan~vrbo-reviews-scraper', { url });
    if (items == null) return null;
    const LABEL = { wonderful: 5, excellent: 5, 'very good': 4, good: 4, average: 3, okay: 3, mediocre: 2, disappointing: 2, poor: 2, terrible: 1 };
    return shapeReviews((items || [])
      .filter(it => it.review_text) // drop failure/diagnostic records
      .map(it => ({
        text: it.review_text,
        rating: LABEL[String(it.rating_label || '').toLowerCase()] ?? 4,
        date: it.trip_summary || null,
        author: it.author,
      })));
  }
  return null; // Booking.com / other sources have no review actor wired up
}

// ── Walkthrough tours (Gemini picks best photos → fal.ai image-to-video) ────────
// Pay-as-you-go video via fal.ai (Minimax Hailuo, ~$0.27/clip). One tour per
// listing, cached + shared; generated when a listing first becomes someone's top
// choice (or via the organizer button). Bounded by a per-trip cap.
const FAL_KEY = process.env.FAL_KEY || '';
const FAL_MODEL = process.env.FAL_MODEL || 'fal-ai/minimax/hailuo-02/standard/image-to-video';
const TOUR_MAX_CLIPS = Math.max(1, Number(process.env.TOUR_MAX_CLIPS || 3));
const TOUR_TRIP_CAP  = Math.max(1, Number(process.env.TOUR_TRIP_CAP || 12));
const TOUR_CLIP_SECONDS = Number(process.env.TOUR_CLIP_SECONDS || 6);
// fal hailuo-02 standard (768p) bills per second of generated video. Used only
// to turn the app-side clip meter into an *estimated* dollar cost on the admin
// board — fal exposes no per-key spend API to read live.
const FAL_RATE_PER_SEC = Number(process.env.FAL_RATE_PER_SEC || 0.045); // $/sec
function falConfigured() { return !!FAL_KEY; }

function loadTours(tripId)    { return readJson(tripFile(tripId, 'tours.json'), {}); }
function saveTours(m, tripId) { writeJsonAtomic(tripFile(tripId, 'tours.json'), m); }

// Gemini vision: rank a listing's photos → indices of the best spaces to feature.
async function pickBestPhotos(photos, maxN = TOUR_MAX_CLIPS) {
  const gk = process.env.GEMINI_API_KEY;
  const list = (photos || []).slice(0, 12);
  const fallback = () => list.slice(0, maxN).map((_, i) => ({ index: i, feature: 'Highlight' }));
  if (!gk || !geminiGuard() || list.length === 0) return fallback();
  if (list.length <= maxN) return fallback();
  const parts = [{ text: `These are photos of ONE vacation rental, in order (index 0..${list.length - 1}). Build a short house-tour shot list of ${maxN} photos, IN TOUR ORDER:
1) FIRST pick the best establishing EXTERIOR shot — the front of the house, facade, building, or full exterior — if ANY photo shows one (this should lead the tour).
2) Then pick the most impressive interior/outdoor WOW spaces (pool, games room, view, great room, theater, hot tub).
Avoid plain bedrooms, bathrooms, and closets. If no exterior photo exists, just pick the ${maxN} best spaces.
Respond JSON only: {"picks":[{"index":n,"feature":"short label"}]}` }];
  for (const url of list) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 4_000_000) continue;
      parts.push({ inline_data: { mime_type: r.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') } });
    } catch { /* skip unreachable photo */ }
  }
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gk}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    const d = await r.json();
    bumpUsage('gemini', { calls: 1 });
    if (!r.ok) return fallback();
    const j = JSON.parse(d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '{}');
    const picks = (j.picks || []).filter(p => Number.isInteger(p.index) && p.index >= 0 && p.index < list.length).slice(0, maxN);
    return picks.length ? picks : fallback();
  } catch { return fallback(); }
}

const TOUR_PROMPT = (feature) => `Fast-paced cinematic real-estate house tour of the ${feature || 'space'}: the camera glides briskly and continuously through the space in one flowing take, covering the whole area, smooth steady gimbal motion, bright natural light, premium and inviting, no people, no text.`;

// Submit one image→video job to fal.ai's queue; returns {requestId,statusUrl,responseUrl}.
async function falSubmit(imageUrl, prompt) {
  if (!FAL_KEY) return null;
  try {
    const r = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, prompt, duration: String(TOUR_CLIP_SECONDS) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.request_id) { console.error('[fal] submit', r.status, JSON.stringify(d).slice(0, 200)); return null; }
    bumpUsage('fal', { submits: 1, seconds: TOUR_CLIP_SECONDS });
    return { requestId: d.request_id, statusUrl: d.status_url, responseUrl: d.response_url };
  } catch (e) { console.error('[fal] submit error', e.message); return null; }
}
// Poll one in-flight clip; returns { done, videoUrl }.
async function falPoll(clip) {
  if (!FAL_KEY || !clip.statusUrl) return { done: false };
  try {
    const sr = await fetch(clip.statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    const sd = await sr.json().catch(() => ({}));
    if (sd.status !== 'COMPLETED') return { done: false };
    const rr = await fetch(clip.responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    const rd = await rr.json().catch(() => ({}));
    const url = rd.video?.url || rd.output?.video?.url || (Array.isArray(rd.videos) && rd.videos[0]?.url) || null;
    return { done: !!url, videoUrl: url };
  } catch { return { done: false }; }
}

// Ensure a listing has a tour (generate clips if missing). Returns the tour or null.
async function ensureTour(tripId, listingId, { force = false, bypassCap = false } = {}) {
  if (!falConfigured()) return null;
  const key = String(listingId);
  const tours = loadTours(tripId);
  if (tours[key] && !force) return tours[key];
  // Per-trip cap guards fal spend; super-admins (bypassCap) can go past it.
  if (!force && !bypassCap && Object.keys(tours).length >= TOUR_TRIP_CAP) { console.warn(`[tours] cap reached for ${tripId}`); return null; }
  const listing = findListingByIdInTrip(tripId, key);
  const photos = (listing && listing.photos) || [];
  if (!listing || photos.length === 0) return null;
  const picks = await pickBestPhotos(photos);
  if (!picks.length) return null;
  const clips = [];
  for (const p of picks) {
    const sub = await falSubmit(photos[p.index], TOUR_PROMPT(p.feature));
    clips.push({ photo: photos[p.index], feature: p.feature || 'Highlight', requestId: sub?.requestId || null, statusUrl: sub?.statusUrl || null, responseUrl: sub?.responseUrl || null, videoUrl: null });
  }
  if (!clips.some(c => c.requestId)) return null; // all submits failed
  const tour = { listing_id: key, name: (listing.name || null), status: 'generating', clips, created_at: new Date().toISOString() };
  const fresh = loadTours(tripId); fresh[key] = tour; saveTours(fresh, tripId);
  console.log(`[tours] generating ${clips.length}-clip tour for ${tripId}/${key}`);
  return tour;
}

// Background ticker: advance in-flight tours (fill clip URLs, mark ready).
async function tickTours() {
  if (!falConfigured()) return;
  for (const tripId of Object.keys(loadTrips())) {
    let tours;
    try { tours = loadTours(tripId); } catch { continue; }
    let changed = false;
    for (const t of Object.values(tours)) {
      if (t.status === 'ready') continue;
      for (const c of t.clips) {
        if (c.videoUrl || !c.requestId) continue;
        const { done, videoUrl } = await falPoll(c);
        if (done && videoUrl) { c.videoUrl = videoUrl; changed = true; }
      }
      if (t.clips.every(c => c.videoUrl)) { if (t.status !== 'ready') { t.status = 'ready'; changed = true; } }
    }
    if (changed) saveTours(tours, tripId);
  }
}
function scheduleTours() {
  if (!falConfigured()) { console.log('[tours] FAL_KEY not set — video tours disabled'); return; }
  setInterval(() => { tickTours().catch(e => console.error('[tours] tick', e.message)); }, 30000);
  console.log('[tours] poller armed (every 30s)');
}

// ── Apify token management + spend guard ───────────────────────────────────────
// Two keys: a primary and an optional backup (the free tier is $5/key/month). When
// the primary nears its cap, GroupPad auto-swaps to the backup so searches keep
// working; only when BOTH are near-limit does it pause + email the manager.
// `_activeApify` is the key currently in use; spawned children (pipeline.js) get it
// passed in as APIFY_TOKEN, so the swap propagates everywhere.
// Stacked Apify keys, in priority order. Sources (deduped): APIFY_TOKEN,
// APIFY_TOKEN_FALLBACK, APIFY_TOKEN_3..8, and a comma-list in APIFY_TOKENS.
// The guard rotates to the first key with headroom; spawned children get the
// active key via env so the swap propagates everywhere.
const APIFY_KEYS = (() => {
  const keys = [];
  const add = (k) => { k = (k || '').trim(); if (k && !keys.includes(k)) keys.push(k); };
  add(process.env.APIFY_TOKEN);
  add(process.env.APIFY_TOKEN_FALLBACK);
  for (let i = 3; i <= 8; i++) add(process.env['APIFY_TOKEN_' + i]);
  (process.env.APIFY_TOKENS || '').split(',').forEach(add);
  return keys;
})();
let _activeApify = APIFY_KEYS[0] || '';
let _lastApifyAlertAt = 0;
let _lastApifyDownAlertAt = 0;
const APIFY_ALERT_PCT = Number(process.env.APIFY_ALERT_PCT || 0.85);
function getApifyToken() { return _activeApify; }
function apifyConfigured() { return APIFY_KEYS.length > 0; }
// True if a usage summary shows headroom (or is unknown — never hard-block on errors).
const _apifyHasRoom = (s) =>
  !s || s.usageUsd == null || s.limitUsd == null || s.limitUsd <= 0 || (s.usageUsd / s.limitUsd) < APIFY_ALERT_PCT;

// A key/actor call hard-failed (invalid key, 401/403, or the search returned
// nothing). Email the owner so they know fresh listings stalled — throttled 6h.
async function noteApifyDown(context, detail) {
  const now = Date.now();
  if (now - _lastApifyDownAlertAt < 6 * 60 * 60 * 1000) return;
  _lastApifyDownAlertAt = now;
  console.warn(`[apify-down] ${context}: ${detail}`);
  await sendManagerEmail('⚠️ GroupPad: couldn’t pull fresh listings (Apify)',
    `<p>GroupPad tried to fetch listings (<b>${context}</b>) but the Apify call failed: <code>${String(detail).slice(0, 200)}</code>.</p>
     <p>This usually means a key is invalid, expired, or out of credit. Drop a fresh key into <code>APIFY_TOKEN</code> / <code>APIFY_TOKEN_FALLBACK</code> (or <code>APIFY_TOKENS</code>) on Railway to resume.</p>`).catch(() => {});
}

async function apifyGuard(context) {
  try {
    if (!apifyConfigured()) return true; // nothing configured → never hard-block
    let worstPct = 0;
    for (let i = 0; i < APIFY_KEYS.length; i++) {
      const key = APIFY_KEYS[i];
      const s = await fetchApifySummary(key);
      // Revoked/invalid key — skip it so a dead primary can't pin _activeApify
      // while valid stacked backups sit unused.
      if (s && s.invalid) { console.warn(`[apify-guard] key #${i + 1} is invalid (401) — skipping`); continue; }
      if (_apifyHasRoom(s)) {
        if (_activeApify !== key && i > 0) {
          console.warn(`[apify-guard] swapped to stacked key #${i + 1} for ${context}`);
          sendManagerEmail('GroupPad: switched to a backup Apify key',
            `<p>An earlier Apify key was near its limit or invalid, so GroupPad switched to stacked key #${i + 1} to keep ${context} running — no action needed right now. Replace the earlier keys when you can.</p>`).catch(() => {});
        }
        _activeApify = key;
        return true;
      }
      if (s && s.limitUsd > 0) worstPct = Math.max(worstPct, s.usageUsd / s.limitUsd);
    }
    // No key had room → pause + alert (throttled to once / 12h).
    const now = Date.now();
    if (now - _lastApifyAlertAt > 12 * 60 * 60 * 1000) {
      _lastApifyAlertAt = now;
      await sendManagerEmail(`⚠️ GroupPad: all ${APIFY_KEYS.length} Apify key(s) near limit (${Math.round(worstPct * 100)}%)`,
        `<p>All ${APIFY_KEYS.length} stacked Apify key(s) are near their monthly limit. GroupPad <b>paused ${context}</b> to avoid overage. Add a fresh key to <code>APIFY_TOKEN</code> / <code>APIFY_TOKEN_FALLBACK</code> / <code>APIFY_TOKENS</code> on Railway (or upgrade the plan) to resume.</p>`);
      console.warn(`[apify-guard] all keys near limit (${Math.round(worstPct * 100)}%) — paused ${context}, owner alerted`);
    }
    return false;
  } catch (e) {
    console.error('[apify-guard]', e.message);
    return true;
  }
}

// ── Rate limiting (in-memory, per-IP) ──────────────────────────────────────────
// Protects the endpoints that cost real money (scraping on /submit, Gemini on
// /compare-listings) from being hammered. Good enough for a small group app.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  let lastSweep = 0;
  return (req, res, next) => {
    const now = Date.now();
    // Periodically prune expired buckets so the Map can't grow unbounded across
    // every distinct IP that ever hits the route (bots/scanners) → OOM.
    if (now - lastSweep > windowMs) {
      lastSweep = now;
      for (const [k, r] of hits) if (now > r.reset) hits.delete(k);
    }
    // Prefer the per-user id when signed in (a NAT'd group shares one IP);
    // else req.ip, which Express derives from the trusted proxy hop (not the
    // spoofable leftmost X-Forwarded-For).
    const ip = (req.user && req.user.id) ? `u:${req.user.id}` : (req.ip || 'unknown');
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
// Constant-time string compare so the admin-key check can't be narrowed by timing.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || '';
  if (key && safeEqual(key, ADMIN_KEY)) return next();
  if (isSuperAdmin(req.user)) return next();   // signed-in platform admin — no key needed
  return res.status(401).json({ error: 'Admin access required' });
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
// ── 3-distance reference points (downtown / airport / attraction) ──────────────
// LA's are fixed; other trips carry their own ref_points (set by the search).
const LA_REFS = {
  downtown:   { name: 'Downtown LA',       lat: 34.0522, lng: -118.2437 },
  airport:    { name: 'LAX',               lat: 33.9416, lng: -118.4085 },
  attraction: { name: 'Universal Studios', lat: 34.1381, lng: -118.3534 },
};
function tripRefPoints(tripId) {
  if (!tripId || tripId === LA_TRIP_ID) return LA_REFS;
  const t = getTrip(tripId);
  return (t && t.ref_points) || null;
}
function haversineMi(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || isNaN(v))) return null;
  const toRad = d => (d * Math.PI) / 180, R = 3958.8;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25);
}
function refDistances(lat, lng, refs) {
  if (!refs || typeof lat !== 'number' || typeof lng !== 'number') return [];
  const out = [];
  const add = (icon, kind, p, mph) => {
    if (p && typeof p.lat === 'number') {
      const mi = haversineMi(lat, lng, p.lat, p.lng);
      if (mi != null) out.push({ icon, kind, label: p.name || '', mi, min: Math.max(1, Math.round((mi / mph) * 60)) });
    }
  };
  add('📍', 'downtown', refs.downtown, 28);
  add('✈️', 'airport', refs.airport, 45);
  add('🎡', 'attraction', refs.attraction, 30);
  return out;
}

// Geocode a free-text area to coords via Gemini (cached). Used to give community
// submissions the 3-distance chips when the scrape didn't return coordinates.
const _geoCache = new Map();
async function geocodeArea(area) {
  const key = String(area || '').toLowerCase().trim();
  if (!key) return null;
  if (_geoCache.has(key)) return _geoCache.get(key);
  const gk = process.env.GEMINI_API_KEY;
  if (!gk || !geminiGuard()) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `Give approximate coordinates for the place "${area}". Respond with JSON only: {"lat":0,"lng":0}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gk}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 60, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' } }),
    });
    const d = await r.json();
    if (!r.ok) { _geoCache.set(key, null); return null; }
    const j = JSON.parse(d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '{}');
    const v = (typeof j.lat === 'number' && typeof j.lng === 'number') ? { lat: j.lat, lng: j.lng } : null;
    _geoCache.set(key, v);
    return v;
  } catch { _geoCache.set(key, null); return null; }
}

// Distances for a submission: from scraped coords if present, else geocode the area.
async function submissionDistances(area, lat, lng, tripId) {
  const refs = tripRefPoints(tripId);
  if (!refs) return [];
  if (typeof lat === 'number' && typeof lng === 'number') return refDistances(lat, lng, refs);
  const c = await geocodeArea(area);
  return c ? refDistances(c.lat, c.lng, refs) : [];
}

// One-time boot backfill: existing submissions predate the distances feature and
// store no coords — geocode their areas and fill in the 3-distance chips. Once
// every submission has distances this no-ops (no Gemini calls).
async function backfillSubmissionDistances() {
  const trips = loadTrips();
  for (const tripId of Object.keys(trips)) {
    let subs;
    try { subs = loadSubmitted(tripId); } catch { continue; }
    if (!Array.isArray(subs) || subs.length === 0) continue;
    let changed = false;
    for (const s of subs) {
      if (Array.isArray(s.distances) && s.distances.length) continue;
      const d = await submissionDistances(s.area, s.lat, s.lng, tripId);
      if (d.length) { s.distances = d; changed = true; }
    }
    if (changed) { saveSubmitted(subs, tripId); console.log(`[backfill] submission distances for ${tripId}`); }
  }
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
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    // SSRF guard: follow redirects MANUALLY, re-running assertSafeUrl on every
    // hop, so a listing URL can't 30x-redirect server-side into 169.254.169.254
    // / localhost / an internal service after passing the initial check.
    let cur = url;
    let res;
    for (let hop = 0; hop < 5; hop++) {
      await assertSafeUrl(cur);
      res = await fetch(cur, { signal: ctrl.signal, headers, redirect: 'manual' });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        cur = new URL(res.headers.get('location'), cur).toString();
        continue;
      }
      break;
    }
    clearTimeout(tid);
    return res && res.ok ? await res.text() : '';
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
// Cap concurrent headless-Chromium launches so several simultaneous submits can't
// spawn a dozen browsers and OOM-kill the single instance. Excess waits in a queue.
const _scrapeSem = (() => {
  const max = Math.max(1, Number(process.env.MAX_CONCURRENT_SCRAPES ?? 2));
  let active = 0; const q = [];
  const next = () => { while (active < max && q.length) { active++; q.shift()(); } };
  return { acquire: () => new Promise((r) => { q.push(r); next(); }), release: () => { active = Math.max(0, active - 1); next(); } };
})();

async function fetchPriceWithPlaywright(cleanUrl, source, dates) {
  await _scrapeSem.acquire();
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
    const dated = urlWithDates(cleanUrl, source, dates);
    console.log('[Playwright] loading', dated);

    // SSRF guard: abort any main-frame navigation (incl. server redirects) that
    // resolves to a private/internal/metadata address, so the scraper can't be
    // bounced into the internal network.
    await page.route('**/*', async (route) => {
      const reqq = route.request();
      if (!reqq.isNavigationRequest()) return route.continue();
      try { await assertSafeUrl(reqq.url()); route.continue(); }
      catch { console.warn('[Playwright] blocked internal navigation', reqq.url()); route.abort(); }
    });

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
    // We loaded the page WITH the trip's dates, so a rendered total means the
    // home is bookable for those dates — and an explicit "dates not available"
    // message in the booking panel means it definitively is not.
    const datedSource = source === 'Airbnb' || source === 'VRBO';
    for (const re of textPatterns) {
      const m = allText.match(re);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (val >= 1000 && val <= 200000) {
          console.log('[Playwright] found price in visible text:', val);
          return { price: Math.round(val), type: 'full', available: datedSource ? true : undefined };
        }
      }
    }
    if (datedSource && /those dates are not available|dates? (?:are|is)n[’']?t available|not available for (?:your|these|those|the selected) dates|unavailable for (?:your|these|those|the selected) dates|select new dates|this listing is no longer available|those dates are unavailable/i.test(allText)) {
      console.log('[Playwright] booking panel says the dates are unavailable');
      return { price: null, type: 'unavailable', available: false };
    }

    // Fall back to rendered HTML snapshot — catches embedded JSON data
    const rendered = await page.content();
    const htmlPrice = extractPrice(rendered, source);
    if (htmlPrice) {
      console.log('[Playwright] found price in rendered HTML:', htmlPrice);
      return { price: htmlPrice, type: 'full' };
    }

    // Nightly-rate fallback (boutique sites that only show "$X / night"): take
    // the FIRST plausible rate in document order — the listing's own rate
    // renders above footer cross-sells — and skip "from $X/night" marketing
    // strings, which are teaser prices for OTHER homes. (A global minimum here
    // previously let a "similar homes from $180/night" widget beat the real rate.)
    const nightlyRe = [
      /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/|per\s+)\s*night/ig,
      /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:nightly|\/\s*nt|a\s+night)\b/ig,
    ];
    let nightlyPick = null;
    for (const re of nightlyRe) {
      let m;
      while ((m = re.exec(allText))) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (!(v >= 100 && v <= 40000)) continue;
        if (/from\s*$/i.test(allText.slice(Math.max(0, m.index - 12), m.index))) continue;
        if (nightlyPick == null || m.index < nightlyPick.index) nightlyPick = { v, index: m.index };
      }
    }
    if (nightlyPick) {
      const total = Math.round(nightlyPick.v * 5);
      console.log('[Playwright] nightly rate', nightlyPick.v, '→ 5-night base', total);
      return { price: total, type: 'nightly_only' };
    }

    console.log('[Playwright] no price found on page');
    return null;
  } catch (e) {
    console.error('[Playwright] error:', e.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
    _scrapeSem.release();
  }
}

// Firecrawl v2: renders the page with a managed browser + uses LLM to extract price
// Cap Firecrawl spend: cache the remaining-credit check (~10 min) and stop before
// it runs dry, with a small buffer. Unknown balance → allow (fail open).
let _fcCredit = { at: 0, remaining: null };
async function firecrawlGuard() {
  try {
    if (!FIRECRAWL_KEY) return true;
    if (Date.now() - _fcCredit.at > 10 * 60 * 1000) {
      const c = await fetchFirecrawlCredits().catch(() => null);
      _fcCredit = { at: Date.now(), remaining: c && c.remaining != null ? c.remaining : null };
    }
    return _fcCredit.remaining == null || _fcCredit.remaining > 5;
  } catch { return true; }
}
async function fetchPriceViaFirecrawl(listingUrl) {
  if (!FIRECRAWL_KEY) return null;
  if (!(await firecrawlGuard())) { console.warn('[firecrawl] credits low — skipping scrape'); return null; }
  bumpUsage('firecrawl', { calls: 1 }); // each scrape spends Firecrawl credits
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

// Fallback dates (the seed LA trip) when a caller doesn't pass a trip's own.
const TRIP = { checkin: '2026-08-18', checkout: '2026-08-23', adults: 14 };

// Resolve the check-in/out/adults to scrape a listing for: the trip's own dates
// when available, else the seed fallback. So a December trip scrapes December
// prices instead of the hardcoded August ones.
function tripDates(trip) {
  if (!trip) return TRIP;
  return {
    checkin: trip.checkin || TRIP.checkin,
    checkout: trip.checkout_5n || trip.checkout || TRIP.checkout,
    adults: trip.adults || TRIP.adults,
  };
}

function urlWithDates(cleanUrl, source, dates) {
  const d = dates || TRIP;
  const cin = d.checkin || TRIP.checkin;
  const cout = d.checkout || d.checkout_5n || TRIP.checkout;
  const ad = d.adults || TRIP.adults;
  if (source === 'Airbnb') {
    return `${cleanUrl}?check_in=${cin}&check_out=${cout}&adults=${ad}`;
  }
  if (source === 'VRBO') {
    return `${cleanUrl}?startDate=${cin}&endDate=${cout}&adults=${ad}`;
  }
  return cleanUrl;
}

async function scrapeListingDetails(cleanUrl, parsed, dates) {
  // Fetch with the trip's own dates so the server returns price-specific HTML
  const html = await fetchHtml(urlWithDates(cleanUrl, parsed.source, dates));

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

  // Best-effort availability for the requested dates. We fetched with the trip's
  // dates baked in, so a clear "not available for these dates" signal means the
  // home is booked for the window. Conservative: only flag a definite NO; leave
  // it undefined (unknown) otherwise so we never wrongly claim availability.
  if (/these dates are not available|not available for (?:your|these) (?:dates|selected dates)|dates are no longer available|listing is no longer available|this property is not available/i.test(html)) {
    result.available = false;
  }

  // og:description / meta description for additional clues
  const desc = ogTag(html, 'description') || metaTag(html, 'description') || '';
  if (!result.bd)     { const m = desc.match(/(\d+)\s*bed(?:room)?s?/i);   if (m) result.bd     = +m[1]; }
  if (!result.ba)     { const m = desc.match(/(\d+(?:\.\d+)?)\s*bath/i);   if (m) result.ba     = +m[1]; }
  if (!result.sleeps) { const m = desc.match(/sleeps?\s*(\d+)/i);          if (m) result.sleeps = +m[1]; }

  // Guest capacity → sleeps. Airbnb's og:title omits "sleeps" (it lists
  // bedrooms/beds/baths only), but the page JSON carries the max guest count.
  // Try the embedded fields first, then human-readable phrasings.
  if (!result.sleeps) {
    const capM =
      html.match(/"personCapacity"\s*:\s*(\d+)/i) ||
      html.match(/"guestLabel"\s*:\s*"(\d+)\s*guests?"/i) ||
      html.match(/\b(?:up to|sleeps|accommodates|max(?:imum)?(?:\s+of)?)\s*(\d+)\s*guests?/i) ||
      html.match(/\b(\d+)\s*guests?\s*max(?:imum)?/i);
    if (capM) result.sleeps = Math.min(+capM[1], 50) || null;  // guard against junk matches
  }
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
        if (result.photos.length >= 16) break;
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
      if (result.photos.length >= 16) break;
    }
  } else if (parsed.source === 'VRBO') {
    for (const u of vrboPhotosFromHtml(html)) {
      if (!result.photos.includes(u)) result.photos.push(u);
      if (result.photos.length >= 16) break;
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
      const pwResult = await fetchPriceWithPlaywright(cleanUrl, parsed.source, dates);
      if (pwResult && pwResult.type === 'unavailable') {
        // The booking panel said the trip's dates are blocked — record it and
        // skip Firecrawl (any price it digs up would be for other dates).
        result.available = false;
      } else if (pwResult) {
        result.displayed_5n    = pwResult.price;
        // nightly_only = a base nightly rate × nights, so cleaning/tax get added downstream.
        result.priceIsBaseOnly = pwResult.type === 'nightly_only';
        if (pwResult.available === true) result.available = true; // dated total rendered → bookable
      } else {
        // 3. Last resort: Firecrawl LLM extraction (uses Firecrawl's managed browser)
        const fcResult = await fetchPriceViaFirecrawl(urlWithDates(cleanUrl, parsed.source, dates));
        if (fcResult) {
          result.displayed_5n    = fcResult.price;
          result.priceIsBaseOnly = false;
        }
      }
    }
  }

  result.photos = result.photos.slice(0, 16);
  if (!result.name) result.name = niceNameFromUrl(cleanUrl) || `${parsed.source} listing ${parsed.id}`;

  return result;
}

// Boutique/long-tail sites often don't expose an og:title — derive a readable
// name from the last meaningful URL slug (drops trailing numeric ids), e.g.
// .../encino/via-vallarta-722129 → "Via Vallarta".
function niceNameFromUrl(rawUrl) {
  try {
    const segs = new URL(rawUrl).pathname.split('/').filter(Boolean);
    let slug = segs.pop() || '';
    if (/^\d+$/.test(slug) && segs.length) slug = segs.pop(); // trailing pure-id segment
    slug = slug.replace(/[-_]?\d{4,}$/, '');                  // trailing -722129
    const words = slug.replace(/[-_]+/g, ' ').trim();
    if (!words || words.length < 3) return null;
    return words.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
  } catch { return null; }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// ── Auth: passwordless magic-link ───────────────────────────────────────────────
// Who am I? (null when signed out) — the client bootstraps from this.
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.name, avatar: req.user.avatar || null, isSuperAdmin: isSuperAdmin(req.user) } : null });
});

// Request a sign-in link. Always responds ok (never reveals whether the email
// exists or whether mail is configured) to avoid enumeration.
app.post('/api/auth/request-link', rateLimit({ windowMs: 60000, max: 5 }), async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const token = crypto.randomBytes(32).toString('hex');
  const magic = loadMagic();
  const now = Date.now();
  for (const [h, m] of Object.entries(magic)) if (m.expires_at < now) delete magic[h]; // prune
  magic[sha256(token)] = { email, expires_at: now + MAGIC_TTL_MS };
  saveMagic(magic);
  // Build the sign-in link from the trusted, configured base URL — never from the
  // request Host header (a caller can spoof Host to point a valid token at their
  // own domain and harvest it on click → account takeover).
  const link = `${APP_BASE_URL}/api/auth/verify?token=${token}`;
  // sendMagicLink RETURNS false on failure (it doesn't throw), so a try/catch
  // alone silently reported success and left the person unable to sign in with
  // no idea why. Check the result and tell them the truth so they can retry.
  let sent = false;
  try { sent = await sendMagicLink(email, link); }
  catch (e) { console.error('[auth] magic link threw:', e.message); }
  if (!sent) {
    console.error(`[auth] magic link NOT delivered → ${email}`);
    return res.status(502).json({ error: 'We could not send that email right now. Try again in a moment, or use Google sign-in.' });
  }
  res.json({ ok: true });
});

// Click target from the email: consume the token, start a session, land home.
app.get('/api/auth/verify', rateLimit({ windowMs: 60000, max: 20 }), (req, res) => {
  const token = String(req.query.token || '');
  const magic = loadMagic();
  const hash = sha256(token);
  const rec = magic[hash];
  if (!rec || rec.expires_at < Date.now()) {
    return res.status(400).send('<p>This sign-in link is invalid or expired. <a href="/">Request a new one</a>.</p>');
  }
  delete magic[hash]; // single-use
  saveMagic(magic);
  const user = findOrCreateUser(rec.email);
  const sid = createSession(user.id);
  setSessionCookie(req, res, sid);
  res.redirect('/');
});

// Update display name.
app.patch('/api/auth/me', requireAuth, (req, res) => {
  const users = loadUsers();
  const u = users[req.user.id];
  if (!u) return res.status(404).json({ error: 'Account not found.' });
  if (req.body && typeof req.body.name === 'string') {
    const name = req.body.name.trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'Name cannot be empty.' });
    u.name = name;
  }
  if (req.body && 'avatar' in req.body) {
    u.avatar = req.body.avatar == null ? null : String(req.body.avatar).slice(0, 32);
  }
  saveUsers(users);
  res.json({ user: { id: u.id, email: u.email, name: u.name, avatar: u.avatar || null, isSuperAdmin: isSuperAdmin(req.user) } });
});

app.post('/api/auth/logout', (req, res) => {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (sid) { const s = loadSessions(); if (s[sid]) { delete s[sid]; saveSessions(s); } }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// Admin: invalidate every active session at once (forces all members to sign in
// again). Used to reset state for testing / after a sign-in change.
app.post('/api/admin/logout-all', requireAdmin, (req, res) => {
  const count = Object.keys(loadSessions()).length;
  saveSessions({});
  clearSessionCookie(req, res);
  res.json({ ok: true, cleared: count });
});

// ── Auth: Sign in with Google (OAuth 2.0 authorization-code flow) ────────────────
const OAUTH_STATE_COOKIE = 'gp_oauth_state';
const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// The redirect URI must match exactly what's registered in Google Cloud. Derive it
// from the trusted configured base URL (env override still wins) rather than the
// spoofable request Host header.
function googleRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `${APP_BASE_URL}/api/auth/google/callback`;
}

// Kick off the flow: stash a random state in a short-lived cookie (CSRF guard)
// and bounce the user to Google's consent screen.
app.get('/api/auth/google', (req, res) => {
  if (!googleConfigured()) return res.status(503).send('Google sign-in is not configured.');
  const state = crypto.randomBytes(16).toString('hex');
  const parts = [`${OAUTH_STATE_COOKIE}=${state}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=600'];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Google redirects back here with ?code & ?state. Verify state, swap the code
// for tokens, read the verified email/name, then create our own session.
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    if (!googleConfigured()) return res.status(503).send('Google sign-in is not configured.');
    const { code, state, error } = req.query;
    if (error) return res.status(400).send('<p>Google sign-in was cancelled. <a href="/">Back</a></p>');
    const cookieState = parseCookies(req)[OAUTH_STATE_COOKIE];
    if (!code || !state || !cookieState || state !== cookieState) {
      return res.status(400).send('<p>Sign-in could not be verified. <a href="/api/auth/google">Try again</a></p>');
    }
    // Clear the state cookie now that it's been used.
    const clr = [`${OAUTH_STATE_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (req.secure) clr.push('Secure');
    res.append('Set-Cookie', clr.join('; '));

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResp.ok) {
      console.error('[auth] Google token exchange failed:', tokenResp.status, (await tokenResp.text().catch(() => '')).slice(0, 300));
      return res.status(502).send('<p>Google sign-in failed. <a href="/api/auth/google">Try again</a></p>');
    }
    const tokens = await tokenResp.json();
    const infoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoResp.ok) {
      console.error('[auth] Google userinfo failed:', infoResp.status);
      return res.status(502).send('<p>Google sign-in failed. <a href="/api/auth/google">Try again</a></p>');
    }
    const info = await infoResp.json();
    if (!info.email || !info.email_verified) {
      return res.status(400).send('<p>Your Google account has no verified email. <a href="/">Back</a></p>');
    }
    const user = findOrCreateUser(info.email, info.name);
    const sid = createSession(user.id);
    setSessionCookie(req, res, sid);
    res.redirect('/');
  } catch (e) {
    console.error('[auth] Google callback error:', e && e.message);
    res.status(500).send('<p>Something went wrong signing in. <a href="/api/auth/google">Try again</a></p>');
  }
});

// Each trip-scoped handler is defined once and mounted at BOTH the legacy flat
// path (req.params.tripId === undefined → resolves to the LA trip) and the
// nested /api/trips/:tripId path. Read routes are open (view-by-link); write
// routes require auth and auto-join the caller to the trip.

const hGetListings = (req, res) => res.json(loadListings(req.params.tripId));
app.get('/api/listings', hGetListings);
app.get('/api/trips/:tripId/listings', loadTripOr404, hGetListings);

const hGetVotes = (req, res) => res.json(loadVotes(req.params.tripId));
app.get('/api/votes', hGetVotes);
app.get('/api/trips/:tripId/votes', loadTripOr404, hGetVotes);

// Vote on a listing. Identity comes from the session, not the request body, so
// votes map to a real account and can't be spoofed by typing someone's name.
const hPostVotes = (req, res) => {
  const tripId = req.params.tripId;
  if (tripId && getTrip(tripId)?.voting_closed)
    return res.status(403).json({ error: 'Voting is closed for this trip.' });
  const { listing_id, vote } = req.body || {};
  if (!listing_id || !['up', 'down', null].includes(vote))
    return res.status(400).json({ error: 'expected { listing_id, vote: "up"|"down"|null }' });
  if (UNSAFE_KEY.test(String(listing_id))) return res.status(400).json({ error: 'Invalid listing id' });
  const voter = req.user.id;
  const votes = loadVotes(tripId);
  if (!Object.prototype.hasOwnProperty.call(votes, listing_id)) votes[listing_id] = {};
  if (vote === null) delete votes[listing_id][voter];
  else votes[listing_id][voter] = vote;
  saveVotes(votes, tripId);
  if (vote) logEvent(tripId, 'vote', `${req.user.name || 'A member'} voted on a home`);
  noteJoin(tripId, req.user); // auto-join on first participation (+ alerts organizer)
  res.json(votes);
};
app.post('/api/votes', requireAuth, rateLimit({ windowMs: 60000, max: 90 }), hPostVotes);
app.post('/api/trips/:tripId/votes', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 90 }), hPostVotes);

// Admin: verify key (global super-admin)
app.get('/api/admin/verify', requireAdmin, (req, res) => res.json({ ok: true }));

// Delete a main listing (organizer-only on nested; super-admin on flat)
const hDeleteListing = (req, res) => {
  const tripId = req.params.tripId;
  const data = loadListings(tripId);
  const before = data.listings.length;
  data.listings = data.listings.filter(l => String(l.id) !== String(req.params.id));
  if (data.listings.length === before)
    return res.status(404).json({ error: 'Listing not found' });
  data.listings.forEach((l, i) => { l.rank = i + 1; }); // re-rank
  saveListings(data, tripId);
  res.json({ ok: true });
};
app.delete('/api/listings/:id', requireAdmin, hDeleteListing);
app.delete('/api/trips/:tripId/listings/:id', requireTripOwner, hDeleteListing);

// Delete a submitted listing
const hDeleteSubmitted = (req, res) => {
  const tripId = req.params.tripId;
  const list = loadSubmitted(tripId);
  const before = list.length;
  const updated = list.filter(l => String(l.id) !== String(req.params.id));
  if (updated.length === before)
    return res.status(404).json({ error: 'Submission not found' });
  saveSubmitted(updated, tripId);
  res.json({ ok: true });
};
app.delete('/api/submitted/:id', requireAdmin, hDeleteSubmitted);
app.delete('/api/trips/:tripId/submitted/:id', requireTripOwner, hDeleteSubmitted);

// Get community submissions
const hGetSubmitted = (req, res) => res.json(loadSubmitted(req.params.tripId));
app.get('/api/submitted', hGetSubmitted);
app.get('/api/trips/:tripId/submitted', loadTripOr404, hGetSubmitted);

// Core submission flow — scrape a URL and attribute it to `user`. Shared by the
// member submit route and the admin bulk-import. Returns { code, body }.
async function createSubmission(tripId, url, manual_price, user, opts = {}) {
  if (!url) return { code: 400, body: { error: 'url required' } };

  const parsed = parseListingUrl(url);
  if (!parsed)
    return { code: 400, body: { error: 'Please enter a valid http/https URL' } };

  // Guard against SSRF before we fetch the URL server-side.
  try { await assertSafeUrl(url); }
  catch (e) { return { code: 400, body: { error: e.message || 'URL not allowed' } }; }

  // Optional re-import: drop any existing community copy first so it re-scrapes.
  if (opts.replace) {
    const cur = loadSubmitted(tripId);
    const next = cur.filter(s => !(s.id === parsed.id && s.source === parsed.source));
    if (next.length !== cur.length) saveSubmitted(next, tripId);
  }

  // Absolute ceiling per trip so submitted.json can't grow without bound.
  const existing = loadSubmitted(tripId);
  if (existing.length >= 250 && !opts.replace)
    return { code: 429, body: { error: 'This trip already has the maximum number of community homes.' } };

  // Dedup check against submitted
  if (existing.find(s => s.id === parsed.id && s.source === parsed.source))
    return { code: 409, body: { error: 'Already submitted' } };

  // Dedup check against main listings
  const main = loadListings(tripId);
  if (main.listings.find(l => String(l.id) === String(parsed.id) && l.source === parsed.source))
    return { code: 409, body: { error: 'Already in the main list' } };

  const cleanUrl = url.split('?')[0];
  const scraped  = await scrapeListingDetails(cleanUrl, parsed, tripDates(getTrip(tripId)));
  const by       = (user.name || user.email?.split('@')[0] || 'member').slice(0, 60);

  // Manual price overrides auto-detection
  const manualVal = manual_price ? Math.round(+String(manual_price).replace(/[$,]/g, '')) : 0;
  if (manualVal >= 500 && manualVal <= 150000) {
    scraped.displayed_5n   = manualVal;
    scraped.priceIsBaseOnly = false;
  }

  // Estimate 5-night all-in price — SAME source-aware formula as the live pipeline
  // (server.js ~2105) so community homes are comparable for budget + AI ranking:
  // Airbnb totals already bundle the cleaning fee; base-only prices add the same
  // cleaning placeholder the pipeline uses. Then apply tax on top.
  let est5n = null;
  if (scraped.displayed_5n) {
    const base = scraped.priceIsBaseOnly ? scraped.displayed_5n + PIPELINE_CLEANING_FEE : scraped.displayed_5n;
    est5n = Math.round(base * (1 + PIPELINE_TAX));
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

  // 3 distance+time chips — from scraped coords, or geocode the area if missing.
  const subDistances = await submissionDistances(scraped.area, scraped.lat, scraped.lng, tripId);

  const entry = {
    id:            parsed.id,
    source:        parsed.source,
    url:           cleanUrl,
    name:          scraped.name,
    area:          scraped.area,
    lat:           typeof scraped.lat === 'number' ? scraped.lat : null,
    lng:           typeof scraped.lng === 'number' ? scraped.lng : null,
    distance_mi:   distance_mi,
    distances:     subDistances,
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
    available:     typeof scraped.available === 'boolean' ? scraped.available : undefined,
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

  // Re-read after the async scrape so two concurrent submits can't clobber
  // each other (the scrape is the only await between read and write).
  const fresh = loadSubmitted(tripId);
  fresh.push(entry);
  saveSubmitted(fresh, tripId);
  logEvent(tripId, 'submit', `${by} added "${scraped.name || 'a home'}"`);
  noteJoin(tripId, user); // auto-join on first contribution (+ alerts organizer)

  // Pull this submission's guest reviews in the background so it lands with the
  // same 4 👍 / 4 👎 as everything else (cached; guarded; never blocks the submit).
  (async () => {
    try {
      const key = `${parsed.source}:${parsed.id}`;
      if (loadReviews(tripId)[key]) return;
      if (!(await apifyGuard('a submission reviews fetch'))) return;
      const shaped = await fetchListingReviews(parsed.source, cleanUrl, 20);
      if (shaped) { const m = loadReviews(tripId); m[key] = shaped; saveReviews(m, tripId); }
    } catch (e) { console.error('[reviews] submit fetch failed:', e.message); }
  })();

  return { code: 200, body: entry };
}

// Submit a new listing (member)
const hSubmit = async (req, res) => {
  const { url, manual_price } = req.body || {};
  const r = await createSubmission(req.params.tripId, url, manual_price, req.user);
  res.status(r.code).json(r.body);
};
app.post('/api/submit', requireAuth, rateLimit({ windowMs: 60000, max: 5 }), hSubmit);
app.post('/api/trips/:tripId/submit', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 5 }), hSubmit);

// Admin: bulk-import listings, attributed to a chosen member (by email) or the
// trip organizer. Sequential so it respects the scrape concurrency cap.
const hAdminBulkSubmit = async (req, res) => {
  const tripId = req.params.tripId;
  const { urls, as_email, replace } = req.body || {};
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'urls[] required' });
  let user = null;
  if (as_email) user = Object.values(loadUsers()).find(u => (u.email || '').toLowerCase() === String(as_email).toLowerCase());
  if (!user) { const t = getTrip(tripId) || loadListings(tripId).trip || {}; user = loadUsers()[t.owner_id]; }
  if (!user) return res.status(400).json({ error: 'Could not resolve a user to attribute submissions to' });
  const results = [];
  for (const url of urls.slice(0, 40)) {
    try {
      const r = await createSubmission(tripId, String(url).trim(), undefined, user, { replace: !!replace });
      results.push({ url, code: r.code, name: r.body?.name, error: r.body?.error });
    } catch (e) { results.push({ url, code: 500, error: e.message }); }
  }
  res.json({ attributed_to: user.email, added: results.filter(r => r.code === 200).length, total: results.length, results });
};
app.post('/api/trips/:tripId/admin-submit', loadTripOr404, requireAdmin, hAdminBulkSubmit);

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

const hPipeline = (req, res) => {
  // Only the original LA trip has a scraped pipeline (the Apify scraper is
  // LA-specific). Any other trip is powered by member submissions only.
  if (req.params.tripId && req.params.tripId !== LA_TRIP_ID) {
    return res.json({ listings: [], count: 0, note: "No auto-scraped listings for this trip — add the homes you're considering above." });
  }
  const db = getPipelineDb();
  if (!db) {
    const seed = loadSeedListings();
    return res.json({ listings: seed, count: seed.length, note: 'Showing saved snapshot — pipeline DB unavailable' });
  }
  try {
    // The `distances` and `distance_mi` columns are added by the pipeline on its
    // next run; older/read-only DBs may not have them yet, so select conditionally
    // to avoid "no such column" (which otherwise throws → silent seed fallback,
    // hiding ALL live listings).
    const cols = db.prepare('PRAGMA table_info(listings)').all().map(c => c.name);
    const hasDistances = cols.includes('distances');
    const hasDistanceMi = cols.includes('distance_mi');
    const hasIsNew = cols.includes('is_new');
    const rows = db.prepare(`
      SELECT
        l.source, l.listing_id, l.name, l.url, l.location,
        l.bedrooms, l.bathrooms, l.sleeps,
        l.amenities, l.photos,
        l.has_pool, l.has_parking,
        l.rating, l.reviews, ${hasDistanceMi ? 'l.distance_mi' : 'NULL AS distance_mi'}, ${hasDistances ? 'l.distances' : "'[]' AS distances"},
        l.enriched, l.last_seen, ${hasIsNew ? 'l.is_new' : '0 AS is_new'},
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
        is_new:       !!r.is_new,
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
        distances:    (() => { try { return JSON.parse(r.distances || '[]'); } catch { return []; } })(),
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
};
app.get('/api/pipeline-listings', hPipeline);
app.get('/api/trips/:tripId/pipeline-listings', loadTripOr404, hPipeline);

// ── AI compare (Gemini) ───────────────────────────────────────────────────────
// Body: { listings: [{name,bd,ba,sleeps,area,distance_mi,est_5n,pool,hot_tub,
//          parking,rating,reviews,url,amenities}], itinerary: "free text",
//          criteria?: "free text" }
// Returns: { analysis: "markdown text" }
// Gemini has no per-key billing API, so we self-meter tokens → estimated USD and
// hard-stop when the configured monthly cap is hit (mirrors apifyGuard). Rates +
// usage are read at call time, so referencing the later-declared rate consts is safe.
const GEMINI_MONTHLY_CAP_USD = Number(process.env.GEMINI_MONTHLY_CAP_USD ?? 25);
function geminiSpendThisMonthUsd() {
  const g = (loadUsage()[usageMonth()] || {}).gemini || {};
  return (g.promptTokens || 0) * GEMINI_IN_RATE + (g.candidatesTokens || 0) * GEMINI_OUT_RATE;
}
function geminiGuard() {
  try { return geminiSpendThisMonthUsd() < GEMINI_MONTHLY_CAP_USD; }
  catch { return true; } // fail open on a metering error rather than block all AI
}

// Render a structured Scout verdict back to markdown — the safety net for old
// clients and the text cached for stale-insights comparison.
function verdictToMarkdown(v, headToHead) {
  if (!v || typeof v !== 'object') return '';
  const out = [];
  if (v.summary) out.push(v.summary, '');
  if (Array.isArray(v.ranked) && v.ranked.length) {
    out.push('### Ranked');
    for (const r of v.ranked) out.push(`- **#${r.n} ${r.name}** — ${r.reason}`);
    out.push('');
  }
  if (Array.isArray(v.table) && v.table.length) {
    out.push('| # | beds/sleeps | ~all-in | distance | pool/hot tub | standout |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    for (const t of v.table) out.push(`| ${t.n ?? ''} ${t.name || ''} | ${t.bedsSleeps || ''} | ${t.allIn || ''} | ${t.distance || ''} | ${t.poolHotTub || ''} | ${t.standout || ''} |`);
    out.push('');
  }
  if (Array.isArray(v.picks) && v.picks.length) {
    for (const p of v.picks) out.push(`- **${p.name}:** ${p.line}`);
    out.push('');
  }
  if (Array.isArray(v.redFlags) && v.redFlags.length) {
    out.push('### Red flags');
    for (const f of v.redFlags) out.push(`- **${f.name}:** ${f.note}`);
  }
  return out.join('\n').trim();
}

const hCompare = async (req, res) => {
  const tripId = req.params.tripId;
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI compare is not configured (GEMINI_API_KEY missing).' });
  }
  if (!geminiGuard()) {
    return res.status(429).json({ error: 'Scout has reached its usage limit for this month — comparisons are paused. The site owner can raise GEMINI_MONTHLY_CAP_USD.' });
  }
  const { listings, criteria, mode } = req.body || {};
  if (!Array.isArray(listings) || listings.length < 2) {
    return res.status(400).json({ error: 'Pick at least 2 listings to compare.' });
  }
  const headToHead = mode === '1v1' && listings.length === 2;
  const trip = getTrip(tripId) || loadListings(tripId).trip || {};
  const adults = trip.adults || 14;
  const dest = trip.destination || 'their destination';
  // Itinerary comes from the single organizer-posted source, not per-user uploads.
  const itinerary = loadItinerary(tripId).text || '';
  // Fold in member caveats so the AI weighs what the group actually cares about.
  const caveats = loadCaveats(tripId).filter(c => (c.status ?? 'approved') === 'approved').slice(-30).map(c => `- ${c.name}: ${c.text}`).join('\n');

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

  const dateStr = trip.checkin && trip.checkout_5n ? ` (${trip.checkin}–${trip.checkout_5n})` : '';
  const budStr = trip.budget ? `, budget ~$${Number(trip.budget).toLocaleString()} all-in` : '';
  const context =
`You are helping a group of ${adults} friends choose a large rental home for a group trip to ${dest}${dateStr}${budStr}. They prefer large homes that comfortably fit the whole group.

${itinerary ? `Their trip itinerary / plans (posted by the trip organizer):\n${String(itinerary).slice(0, 4000)}\n` : 'No itinerary was provided.'}
${caveats ? `Individual member caveats / must-haves:\n${caveats.slice(0, 1500)}\n` : ''}
${criteria ? `Extra criteria they care about:\n${String(criteria).slice(0, 1000)}\n` : ''}`;

  const hasItinerary = !!itinerary;
  const itineraryRule = hasItinerary
    ? 'IMPORTANT: explicitly reference specific items from their itinerary above (named activities, neighborhoods, the party/event) when explaining fit — e.g. "10 min from the Universal Studios day" or "close to the Santa Monica dinner". Tie at least two points directly to the itinerary.'
    : 'No itinerary was posted, so judge on group size, budget, and distance from DTLA.';

  // Scout returns STRUCTURED JSON (not a prose blob), so the client can render a
  // branded, scannable verdict instead of a wall of markdown. A markdown fallback
  // is derived from the structure for old clients and the stale-insights cache.
  const prompt = headToHead
    ? `${context}
Head-to-head: compare these TWO homes (JSON):
${JSON.stringify(compact, null, 1)}

${itineraryRule}

Return a JSON verdict for this 1-vs-1:
- summary: one warm, plain sentence naming the better pick. No hype words.
- winner: { n, name, why } — why it wins in one sentence${hasItinerary ? ', tied to their itinerary' : ''}.
- table: one row per home with { n, name, bedsSleeps (e.g. "7 / 16"), allIn (e.g. "$5,766" or "—"), distance (e.g. "26 mi" or "—"), poolHotTub (e.g. "Pool · Hot tub", "Pool", or "—"), standout (3-5 words) }.
- picks: exactly two { n, name, line } — "the case for this one" in one short line each, tied to their plans.
- redFlags: { n, name, severity ("high"|"medium"), note } for any real concern, else [].
- ranked: best home first as { n, name, fit ("best"|"good"|"skip"), reason }.
Write like a sharp friend, not a brochure. No em dashes.`
    : `${context}
Here are the candidate listings (JSON):
${JSON.stringify(compact, null, 1)}

${itineraryRule}

Return a JSON verdict:
- summary: one warm, plain sentence framing the choice for this group. No hype words.
- ranked: every home, best fit first, as { n, name, fit ("best"|"good"|"skip"), reason } — reason is one short line tied to their itinerary and group of ${adults}.
- winner: the top pick as { n, name, why }.
- table: one row per home { n, name, bedsSleeps (e.g. "7 / 16"), allIn (e.g. "$5,766" or "—"), distance (e.g. "26 mi" or "—"), poolHotTub (e.g. "Pool · Hot tub", "Pool", or "—"), standout (3-5 words) }.
- redFlags: real concerns only (too far for their plans, tight capacity for ${adults}, over budget, no reviews) as { n, name, severity ("high"|"medium"), note }. Empty array if none.
Write like a sharp friend, not a brochure. No em dashes.`;

  const verdictSchema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      winner: { type: 'object', properties: { n: { type: 'integer' }, name: { type: 'string' }, why: { type: 'string' } } },
      ranked: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, name: { type: 'string' }, fit: { type: 'string', enum: ['best', 'good', 'skip'] }, reason: { type: 'string' } }, required: ['n', 'name', 'fit', 'reason'] } },
      table: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, name: { type: 'string' }, bedsSleeps: { type: 'string' }, allIn: { type: 'string' }, distance: { type: 'string' }, poolHotTub: { type: 'string' }, standout: { type: 'string' } }, required: ['n', 'name'] } },
      redFlags: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, name: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium'] }, note: { type: 'string' } }, required: ['name', 'note'] } },
      picks: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, name: { type: 'string' }, line: { type: 'string' } }, required: ['name', 'line'] } },
    },
    required: ['summary', 'ranked', 'table'],
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // thinkingBudget:0 keeps 2.5-flash from spending the output budget on
        // internal reasoning (which was truncating the visible answer).
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: verdictSchema, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[compare] Gemini error', r.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: data.error?.message || `Gemini HTTP ${r.status}` });
    }
    // Meter token spend (Gemini has no per-key billing API, so we track it here).
    const um = data.usageMetadata || {};
    bumpUsage('gemini', {
      calls: 1,
      promptTokens: um.promptTokenCount || 0,
      candidatesTokens: um.candidatesTokenCount || 0,
      totalTokens: um.totalTokenCount || ((um.promptTokenCount || 0) + (um.candidatesTokenCount || 0)),
    });
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!raw) return res.status(502).json({ error: 'Scout returned nothing. Try again in a moment.' });
    let verdict = null;
    try { verdict = JSON.parse(raw); } catch { /* fall back to raw text below */ }
    // Always provide a markdown rendering too: old clients and the stale-insights
    // cache key off `analysis`, and it is the safety net if structured parse fails.
    const analysis = verdict ? verdictToMarkdown(verdict, headToHead) : raw;
    // Cache the full-shortlist verdict so everyone sees it without re-spending on
    // Gemini. 1v1 battles are ad-hoc and not cached.
    if (!headToHead) {
      const ids = listings.map(l => String(l.id)).sort();
      saveInsights({ analysis, verdict, count: compact.length, ids, created_at: new Date().toISOString() }, tripId);
    }
    res.json({ analysis, verdict });
  } catch (e) {
    console.error('[compare]', e.message);
    res.status(500).json({ error: 'Scout could not compare these right now. Try again in a moment.' });
  }
};
app.post('/api/compare-listings', requireAuth, rateLimit({ windowMs: 60000, max: 10 }), hCompare);
app.post('/api/trips/:tripId/compare-listings', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 10 }), hCompare);

// ── Ask Scout: a member's PERSONAL question about the shortlist ────────────────
// Conversational, scoped to this caller, and never cached — so it does not touch
// the trip-wide analysis everyone else sees.
const hAskScout = async (req, res) => {
  const tripId = req.params.tripId;
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'Scout is not configured right now.' });
  if (!geminiGuard()) return res.status(429).json({ error: 'Scout has reached its usage limit for this month. Try again later.' });
  const { listings, question } = req.body || {};
  const q = String(question || '').trim();
  if (!q) return res.status(400).json({ error: 'Type a question first.' });
  if (q.length > 600) return res.status(400).json({ error: 'Keep the question a little shorter.' });

  const trip = getTrip(tripId) || {};
  const adults = trip.adults || 14;
  const dest = trip.destination || 'their destination';
  const itinerary = loadItinerary(tripId).text || '';
  const compact = (Array.isArray(listings) ? listings : []).slice(0, 12).map((l, i) => ({
    n: i + 1, name: l.name, beds: l.bd, baths: l.ba, sleeps: l.sleeps, area: l.area,
    miFromDTLA: l.distance_mi, est_all_in_5n: l.est_5n, pool: l.pool === 'yes',
    hot_tub: l.hot_tub === 'yes', parking: l.parking === 'yes', rating: l.rating, reviews: l.reviews,
  }));

  const prompt = `You are Scout, helping ONE member of a group of ${adults} planning a trip to ${dest}. They are asking YOU a quick question about their shortlisted homes. Answer just them.

Shortlisted homes (JSON):
${JSON.stringify(compact, null, 1)}
${itinerary ? `\nThe group's trip plans:\n${String(itinerary).slice(0, 2000)}\n` : ''}
Their question: "${q}"

Reply in 2 to 4 short sentences. Refer to homes by name. If the data does not answer it, say so plainly. Write like a sharp friend texting back, not a brochure. No "great question", no preamble, no em dashes.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    const data = await r.json();
    if (!r.ok) { console.error('[ask-scout] Gemini', r.status, JSON.stringify(data).slice(0, 200)); return res.status(502).json({ error: 'Scout could not answer that. Try again in a moment.' }); }
    const um = data.usageMetadata || {};
    bumpUsage('gemini', { calls: 1, promptTokens: um.promptTokenCount || 0, candidatesTokens: um.candidatesTokenCount || 0, totalTokens: um.totalTokenCount || 0 });
    const answer = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!answer) return res.status(502).json({ error: 'Scout had nothing to add there.' });
    res.json({ answer }); // intentionally NOT cached to insights
  } catch (e) {
    console.error('[ask-scout]', e.message);
    res.status(500).json({ error: 'Scout could not answer right now. Try again in a moment.' });
  }
};
app.post('/api/trips/:tripId/ask-scout', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 15 }), hAskScout);

// ── AI-ranked recommendations ────────────────────────────────────────────────
// Scout ranks the FULL candidate pool (curated + live + community — the client
// sends them) by itinerary fit + all facets, with a one-line "why" each. Cached
// by hash(candidate ids + itinerary + approved caveats) so the same pool never
// re-spends Gemini; recomputes only when the pool or itinerary changes. Guests
// and over-cap requests get a heuristic order (no spend), so the board never blocks.
function loadAiRank(tripId) { return readJson(tripFile(tripId, 'ai-rank.json'), null); }
function saveAiRank(tripId, v) { writeJsonAtomic(tripFile(tripId, 'ai-rank.json'), v); }
function heuristicRankOrder(listings) {
  const score = (l) => (l.budget === 'under' ? 3 : l.budget === 'marginal' ? 1 : l.budget === 'over' ? -1 : 0) * 100
    + (l.rating || 0) * 10 + (l.sleeps || 0) * 0.1 - (l.distance_mi || 0) * 0.05;
  return [...listings].sort((a, b) => score(b) - score(a)).map((l) => ({ id: String(l.id), why: null }));
}
const hAiRank = async (req, res) => {
  const tripId = req.params.tripId;
  const all = (Array.isArray(req.body?.listings) ? req.body.listings : []).filter((l) => l && l.id != null);
  if (all.length < 2) return res.status(400).json({ error: 'Need at least 2 listings to rank.' });

  const itinerary = loadItinerary(tripId).text || '';
  const caveats = loadCaveats(tripId).filter((c) => (c.status ?? 'approved') === 'approved').map((c) => `${c.name}: ${c.text}`).join('\n');
  const crypto = require('crypto');
  const ids = all.map((l) => String(l.id)).sort();
  const hash = crypto.createHash('sha1').update(`${ids.join(',')}::${itinerary}::${caveats}`).digest('hex');

  const cached = loadAiRank(tripId);
  if (cached && cached.hash === hash && req.query.force !== '1') {
    return res.json({ order: cached.order, ranked_at: cached.ranked_at, cached: true });
  }
  // Only an authed MEMBER of this trip (or its owner) under the cost cap may
  // trigger a fresh Gemini spend / overwrite the shared cache — otherwise any
  // signed-in account could drain the budget or poison another trip's ranking.
  const isMember = !!req.user && !!req.trip
    && (req.trip.owner_id === req.user.id || (req.trip.members || []).includes(req.user.id) || isSuperAdmin(req.user));
  if (!GEMINI_API_KEY || !isMember || !geminiGuard()) {
    return res.json({ order: heuristicRankOrder(all), ranked_at: null, fallback: true });
  }

  const trip = getTrip(tripId) || loadListings(tripId).trip || {};
  const adults = trip.adults || 14;
  const dest = trip.destination || 'their destination';
  const pre = heuristicRankOrder(all).slice(0, 22).map((o) => all.find((l) => String(l.id) === o.id)).filter(Boolean);
  // Short keys ("c0", "c1"…) — the real ids are 19-digit numbers that lose
  // precision if the model echoes them as JSON numbers, so never send the raw id.
  const keyToId = {};
  const compact = pre.map((l, i) => {
    const k = 'c' + i; keyToId[k] = String(l.id);
    return {
      k, name: (l.name || '').slice(0, 80), source: l.source,
      beds: l.bd, baths: l.ba, sleeps: l.sleeps, area: l.area, miFromDTLA: l.distance_mi,
      all_in_5n: l.est_5n, per_person: l.est_5n ? Math.ceil(l.est_5n / Math.max(1, adults)) : null,
      budget: l.budget, pool: l.pool === 'yes', hot_tub: l.hot_tub === 'yes', parking: l.parking === 'yes',
      rating: l.rating, reviews: l.reviews, community: !!l.submitted_by,
    };
  });
  const prompt = `You rank vacation rentals for a group of ${adults} planning a trip to ${dest}${trip.budget ? `, budget ~$${Number(trip.budget).toLocaleString()} all-in` : ''}. Rank the homes from BEST to WORST overall fit, weighing: all-in & per-person cost vs budget, distance/convenience to their plans, capacity for the whole group, pool/parking/amenities, and ratings.
${itinerary ? `\nGroup itinerary / plans:\n${itinerary.slice(0, 3000)}\n` : ''}${caveats ? `\nGroup must-haves / dealbreakers:\n${caveats.slice(0, 1500)}\n` : ''}
Candidates (JSON):\n${JSON.stringify(compact)}
Return ONLY a JSON array, best first, of {"k":"<the candidate's k>","why":"<one short sentence, ≤16 words${itinerary ? ', referencing their itinerary/must-haves when relevant' : ''}>"}. Use the exact "k" values. Include every candidate exactly once.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } }) });
    const data = await r.json();
    if (!r.ok) { console.error('[ai-rank] gemini', r.status, JSON.stringify(data).slice(0, 200)); return res.json({ order: heuristicRankOrder(all), fallback: true }); }
    const um = data.usageMetadata || {};
    bumpUsage('gemini', { calls: 1, promptTokens: um.promptTokenCount || 0, candidatesTokens: um.candidatesTokenCount || 0, totalTokens: um.totalTokenCount || 0 });
    let parsed = [];
    const rawText = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '[]';
    try {
      const raw = JSON.parse(rawText);
      parsed = Array.isArray(raw) ? raw : (Array.isArray(raw.ranking) ? raw.ranking : (Object.values(raw).find(Array.isArray) || []));
    } catch { parsed = []; }
    let order = parsed.filter((o) => o && keyToId[o.k]).map((o) => {
      const w = o.why ?? o.reason ?? o.reasoning;
      return { id: keyToId[o.k], why: typeof w === 'string' && w.trim() ? w.trim().slice(0, 140) : null };
    });
    const seen = new Set(order.map((o) => o.id));
    for (const o of heuristicRankOrder(all)) if (!seen.has(o.id)) order.push(o);
    if (order.length < 2) order = heuristicRankOrder(all);
    const out = { hash, order, ranked_at: new Date().toISOString() };
    saveAiRank(tripId, out);
    res.json({ order, ranked_at: out.ranked_at });
  } catch (e) {
    console.error('[ai-rank]', e.message);
    res.json({ order: heuristicRankOrder(all), fallback: true });
  }
};
app.post('/api/trips/:tripId/ai-rank', loadTripOr404, rateLimit({ windowMs: 60000, max: 8 }), hAiRank);

// Admin: trigger a pipeline run (runs pipeline.js as a child process)
app.post('/api/admin/run-pipeline', requireAdmin, async (req, res) => {
  if (!apifyConfigured()) return res.status(400).json({ error: 'No Apify key set on server' });
  if (!(await apifyGuard('the manual pipeline run')))
    return res.status(429).json({ error: 'Apify usage is near its monthly limit — paused. Rotate APIFY_TOKEN to resume.' });
  const { spawn } = require('child_process');
  console.log('[Admin] Starting pipeline run…');
  const child = spawn('node', ['pipeline.js'], { cwd: __dirname, env: { ...process.env, APIFY_TOKEN: getApifyToken() }, detached: true, stdio: 'ignore' });
  child.on('exit', (code) => { if (code === 0) notifyFreshHomes(LA_TRIP_ID); }); // email members: fresh homes
  child.unref();
  res.json({ ok: true, message: 'Pipeline started in background — check server logs' });
});

// Latest cached AI shortlist analysis, shown to everyone.
const hGetInsights = (req, res) => res.json(loadInsights(req.params.tripId) || { analysis: '', created_at: null });
app.get('/api/insights', hGetInsights);
app.get('/api/trips/:tripId/insights', loadTripOr404, hGetInsights);

// ── Trip itinerary (organizer posts one canonical itinerary; everyone reads it) ─
const hGetItinerary = (req, res) => res.json(loadItinerary(req.params.tripId));
app.get('/api/itinerary', hGetItinerary);
app.get('/api/trips/:tripId/itinerary', loadTripOr404, hGetItinerary);

const hSetItinerary = (req, res) => {
  const text = String((req.body && req.body.text) || '').slice(0, 8000);
  const it = { text, updated_at: new Date().toISOString() };
  saveItinerary(it, req.params.tripId);
  res.json(it);
};
app.post('/api/admin/itinerary', requireAdmin, hSetItinerary);
app.post('/api/trips/:tripId/itinerary', requireTripOwner, hSetItinerary);

// ── Member caveats (small chat: each member adds their own must-haves) ──────────
const hGetCaveats = (req, res) => res.json(loadCaveats(req.params.tripId));
app.get('/api/caveats', hGetCaveats);
app.get('/api/trips/:tripId/caveats', loadTripOr404, hGetCaveats);

const hPostCaveat = (req, res) => {
  const tripId = req.params.tripId;
  const name = req.user.name || 'Member';
  const text = String((req.body && req.body.text) || '').slice(0, 500).trim();
  if (!text) return res.status(400).json({ error: 'Say something first.' });
  const list = loadCaveats(tripId);
  // Members submit a *request*; the organizer's own criteria are auto-approved.
  // Only approved criteria feed Scout's ranking.
  const trip = getTrip(tripId);
  const status = trip && trip.owner_id === req.user.id ? 'approved' : 'pending';
  list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), user_id: req.user.id, name, text, status, created_at: new Date().toISOString() });
  const trimmed = list.slice(-200); // keep the log bounded
  saveCaveats(trimmed, tripId);
  if (status === 'approved') { logEvent(tripId, 'caveat', `${name}: "${text.slice(0, 100)}"`); markInsightsStale(tripId); }
  noteJoin(tripId, req.user);
  res.json(trimmed);
};
app.post('/api/caveats', requireAuth, rateLimit({ windowMs: 60000, max: 20 }), hPostCaveat);
app.post('/api/trips/:tripId/caveats', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 20 }), hPostCaveat);

// Organizer approves a pending criterion request → it starts feeding Scout.
const hApproveCaveat = (req, res) => {
  const tripId = req.params.tripId;
  let approved = null;
  const list = loadCaveats(tripId).map((c) => {
    if (c.id !== req.params.id) return c;
    approved = c;
    return { ...c, status: 'approved' };
  });
  saveCaveats(list, tripId);
  if (approved) { logEvent(tripId, 'caveat', `${approved.name}: "${String(approved.text).slice(0, 100)}"`); markInsightsStale(tripId); }
  res.json(list);
};
app.post('/api/caveats/:id/approve', requireAdmin, hApproveCaveat);
app.post('/api/trips/:tripId/caveats/:id/approve', requireTripOwner, hApproveCaveat);

const hDeleteCaveat = (req, res) => {
  const tripId = req.params.tripId;
  const before = loadCaveats(tripId);
  const removed = before.find((c) => c.id === req.params.id);
  const updated = before.filter(c => c.id !== req.params.id);
  saveCaveats(updated, tripId);
  // Removing an *approved* criterion changes Scout's context → stale the cache.
  if (removed && (removed.status ?? 'approved') === 'approved') markInsightsStale(tripId);
  res.json(updated);
};
app.delete('/api/caveats/:id', requireAdmin, hDeleteCaveat);
app.delete('/api/trips/:tripId/caveats/:id', requireTripOwner, hDeleteCaveat);

// ── Final pick: member "top choice" poll + organizer-locked decision ────────────
// Transparent + collaborative: members see WHO top-picked each home (`pickers`).
// Guests get aggregate counts only.
function tallyFinal(votes) {
  const counts = {};
  let total = 0;
  for (const lid of Object.values(votes)) {
    if (!lid) continue;
    counts[lid] = (counts[lid] || 0) + 1;
    total++;
  }
  return { counts, total };
}
const hGetFinal = (req, res) => {
  const tripId = req.params.tripId;
  const votes = loadFinalVotes(tripId);
  const { counts, total } = tallyFinal(votes);
  const myPick = req.user ? (votes[req.user.id] || null) : null;
  const trip = req.trip || getTrip(tripId);
  const viewerIsMember = !!(req.user && trip && (trip.owner_id === req.user.id || isMember(trip, req.user) || isSuperAdmin(req.user)));
  let pickers; // { listingId: [userId, ...] } — members only
  if (viewerIsMember) {
    pickers = {};
    for (const [uid, lid] of Object.entries(votes)) {
      if (!lid) continue;
      (pickers[lid] = pickers[lid] || []).push(uid);
    }
  }
  res.json({ counts, total, myPick, decision: loadDecision(tripId), ...(pickers ? { pickers } : {}) });
};
app.get('/api/final', hGetFinal);
app.get('/api/trips/:tripId/final', loadTripOr404, hGetFinal);

const hFinalVote = (req, res) => {
  const tripId = req.params.tripId;
  if (tripId && getTrip(tripId)?.voting_closed)
    return res.status(403).json({ error: 'Voting is closed for this trip.' });
  const raw = req.body && req.body.listing_id;
  if (raw != null && raw !== '' && UNSAFE_KEY.test(String(raw))) return res.status(400).json({ error: 'Invalid listing id' });
  const votes = loadFinalVotes(tripId);
  if (raw === null || raw === undefined || raw === '') {
    delete votes[req.user.id]; // allow clearing your top choice
  } else {
    votes[req.user.id] = String(raw).slice(0, 80);
  }
  saveFinalVotes(votes, tripId);
  if (raw) {
    logEvent(tripId, 'pick', `${req.user.name || 'A member'} set a top choice`);
    // Auto-generate a walkthrough tour for a listing the group is converging on
    // (cached + shared; capped; no-op if FAL_KEY unset or tour already exists).
    ensureTour(tripId, String(raw)).catch((e) => console.error('[tours] auto', e.message));
  }
  noteJoin(tripId, req.user);
  const { counts, total } = tallyFinal(votes);
  res.json({ counts, total, myPick: votes[req.user.id] || null, decision: loadDecision(tripId) });
};
app.post('/api/final-vote', requireAuth, rateLimit({ windowMs: 60000, max: 60 }), hFinalVote);
app.post('/api/trips/:tripId/final-vote', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 60 }), hFinalVote);

// ── Personal saved homes (each member's own shortlist) ──────────────────────────
const hGetFavorites = (req, res) => {
  const favs = loadFavorites(req.params.tripId);
  res.json({ ids: (req.user && favs[req.user.id]) || [] });
};
app.get('/api/favorites', requireAuth, hGetFavorites);
app.get('/api/trips/:tripId/favorites', requireAuth, loadTripOr404, hGetFavorites);

const hToggleFavorite = (req, res) => {
  const tripId = req.params.tripId;
  const id = String((req.body && req.body.listing_id) || '').slice(0, 80);
  if (!id) return res.status(400).json({ error: 'listing_id required' });
  const favs = loadFavorites(tripId);
  const set = new Set(favs[req.user.id] || []);
  const on = req.body && req.body.on;
  if (on === false) set.delete(id);
  else if (on === true) set.add(id);
  else set.has(id) ? set.delete(id) : set.add(id);
  favs[req.user.id] = [...set];
  saveFavorites(favs, tripId);
  res.json({ ids: favs[req.user.id] });
};
app.post('/api/favorites', requireAuth, rateLimit({ windowMs: 60000, max: 90 }), hToggleFavorite);
app.post('/api/trips/:tripId/favorites', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 90 }), hToggleFavorite);

const hDecision = (req, res) => {
  const tripId = req.params.tripId;
  const raw = req.body && req.body.listing_id;
  if (raw === null || raw === undefined || raw === '') {
    saveDecision(null, tripId); // unlock
    return res.json({ decision: null });
  }
  const decision = { listing_id: String(raw).slice(0, 80), locked_at: new Date().toISOString() };
  saveDecision(decision, tripId);
  logEvent(tripId, 'decision', 'The organizer locked the final pick');
  emailDecisionLocked(tripId, decision.listing_id, req.user && req.user.id).catch((e) => console.error('[notify] decision email failed:', e.message));
  res.json({ decision });
};
app.post('/api/admin/decision', requireAdmin, hDecision);
app.post('/api/trips/:tripId/decision', requireTripOwner, hDecision);

// ── Review snippets: cached map (free) + lazy fetch + organizer refresh ──────────
const hGetReviews = (req, res) => res.json(loadReviews(req.params.tripId));
app.get('/api/reviews', hGetReviews);
app.get('/api/trips/:tripId/reviews', loadTripOr404, hGetReviews);

// Fetch-if-missing for one listing (members only; guarded + rate-limited).
const hFetchReviews = async (req, res) => {
  const tripId = req.params.tripId;
  const { source, id, url, force } = req.body || {};
  if (!source || id == null) return res.status(400).json({ error: 'source and id required' });
  if (!url || !parseListingUrl(url)) return res.status(400).json({ error: 'A valid Airbnb/VRBO listing URL is required.' });
  const key = `${source}:${id}`;
  const cached = loadReviews(tripId)[key];
  if (cached && !force) return res.json(cached); // already cached → no spend
  if (!(await apifyGuard('a reviews fetch')))
    return res.status(429).json({ error: 'Reviews are paused — Apify usage is near its monthly limit.' });
  const shaped = await fetchListingReviews(source, url, 20);
  if (!shaped) return res.status(502).json({ error: 'Reviews aren’t available for this listing yet.' });
  const fresh = loadReviews(tripId);
  fresh[key] = shaped;
  saveReviews(fresh, tripId);
  res.json(shaped);
};
app.post('/api/reviews/fetch', requireAuth, rateLimit({ windowMs: 60000, max: 12 }), hFetchReviews);
app.post('/api/trips/:tripId/reviews/fetch', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 12 }), hFetchReviews);

// ── Experiences: things to do near the trip ───────────────────────────────────
// Scraped from Airbnb Experiences by the free self-hosted scraper (experiences.js)
// via scripts/run-experiences.js, spawned detached like the homes trip-search.
// Spec: docs/specs/experiences.md.
function spawnExperiencesSearch(tripId) {
  const t = getTrip(tripId);
  if (!t) return false;
  // Unlike homes, a LOCKED DECISION must not freeze experiences — "you've picked
  // your place, now plan what to do" is the feature's second anchor moment.
  // Only a trip whose dates have passed stops updating.
  if (isTripPast(t)) return false;
  const marker = tripFile(tripId, '.exp-searching');
  try { if (fs.existsSync(marker)) return false; } catch {} // already running
  const { spawn } = require('child_process');
  const env = { ...process.env, TRIP_ID: tripId, EXP_OUT: tripFile(tripId, 'experiences.json') };
  // stdio inherited so a failed scrape leaves a trail in the server logs.
  const child = spawn('node', [path.join('scripts', 'run-experiences.js')], { cwd: __dirname, env, detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
  child.unref();
  console.log(`[experiences] spawned for ${tripId}`);
  return true;
}

// ── Scout job 5 · "Describe" ─────────────────────────────────────────────────
// Most rows arrive as a bare name. OSM gives one by definition, and the Airbnb
// search node carries no blurb — so a card can read just "Koreatown", which
// tells a group deciding what to do precisely nothing. Scout writes the one
// line the provider didn't.
//
// Demarcation (docs/specs/scout.md §2): experiences · ambient · cached+shared.
// The rule that matters here is FACTUAL RESTRAINT — this text sits next to real
// businesses and places, so the prompt is fed only fields we actually hold and
// is told in the strongest terms not to invent hours, addresses, history or
// prices. The non-AI fallback below is pure restatement of those same fields,
// and is written FIRST so no row is ever left blank waiting on a model.
function loadExpAbout(tripId) { return readJson(tripFile(tripId, 'exp-about.json'), {}); }
function saveExpAbout(tripId, v) { writeJsonAtomic(tripFile(tripId, 'exp-about.json'), v); }

// Keyed on the facts a description is built from, so it regenerates when those
// change and NOT when some unrelated field (photo, url) churns on a refresh.
// Bump when the PROMPT changes materially — the first production run wrote
// title restatements ("Hike to X on this 90-minute activity for $17"), and
// without a version in the key those entries would never be rewritten.
const ABOUT_PROMPT_V = 'v2';
function expAboutHash(x) {
  return crypto.createHash('sha1').update([
    ABOUT_PROMPT_V,
    x.title || '', x.category || '', x.source || 'airbnb',
    x.duration ?? '', x.price ?? '', x.priceUnit || '', x.rating ?? '',
  ].join('|')).digest('hex').slice(0, 12);
}

function durWords(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** Deterministic fallback: restates what we know and asserts nothing we don't. */
function templateAbout(x, trip) {
  const where = trip?.destination ? ` in ${String(trip.destination).split(',')[0]}` : '';
  const d = durWords(x.duration);

  if (x.source === 'osm') {
    const head = x.category ? `${x.category}${where}` : `A place to visit${where}`;
    return x.price === 0
      ? `${head} — mapped in OpenStreetMap, free to visit.`
      : `${head} — mapped in OpenStreetMap. Check the site for hours and any ticket price.`;
  }

  // NOTE: as of 2026-08-13 every scraped Airbnb row comes back with
  // category: null (primaryThemeFormatted stopped populating), so this
  // no-category branch is the common path, not the edge case.
  const head = x.category ? `${x.category}${where}`
    : d ? `A ${d} activity${where}`
    : `Something to do${where}`;
  const facts = [];
  if (x.category && d) facts.push(d);
  if (x.rating != null) facts.push(`rated ${Number(x.rating).toFixed(2)}${x.reviews ? ` by ${x.reviews} guests` : ''}`);
  if (x.price === 0) facts.push('free');
  else if (x.price != null) facts.push(`from $${x.price} per ${x.priceUnit === 'group' ? 'group' : 'guest'}`);
  return facts.length ? `${head} — ${facts.join(', ')}.` : `${head}.`;
}

// One fill per trip at a time: GET /experiences is hit by every member on the
// board, and without this each of them would kick off their own batch.
const _describing = new Set();
// A row sitting on its template line is still WORK TO DO. The first production
// run exposed this: one batch is capped at 40, and because the template was
// written with the row's final hash, the other 33 rows looked "done" forever.
// Templates are therefore retried — bounded by attempts and a cooldown so a
// model that keeps failing can't turn every board read into a Gemini call.
const ABOUT_RETRY_MS = 60 * 60 * 1000;
const ABOUT_MAX_TRIES = 2;
function aboutNeedsWork(entry, hash) {
  if (!entry || entry.hash !== hash) return true;
  if (entry.by !== 'template') return false;
  if ((entry.tries || 0) >= ABOUT_MAX_TRIES) return false;
  return Date.now() - new Date(entry.at || 0).getTime() > ABOUT_RETRY_MS;
}

async function fillExpDescriptions(tripId, trip) {
  if (_describing.has(tripId)) return;
  _describing.add(tripId);
  try {
    const rows = loadExperiences(tripId);
    const about = loadExpAbout(tripId);
    const missing = rows.filter((x) => aboutNeedsWork(about[x.id], expAboutHash(x)));
    if (!missing.length) return;

    // Deterministic line first — committed before any network call, so a capped
    // or keyless deploy still ends up with a real description on every row.
    for (const x of missing) {
      const prev = about[x.id];
      const hash = expAboutHash(x);
      about[x.id] = {
        text: prev && prev.hash === hash ? prev.text : templateAbout(x, trip),
        by: 'template', hash,
        at: new Date().toISOString(),
        tries: prev && prev.hash === hash ? (prev.tries || 0) + 1 : 1,
      };
    }
    saveExpAbout(tripId, about);
    if (!GEMINI_API_KEY || !geminiGuard()) return;

    // Work through ALL of them, 40 per call. Capping at a single batch left a
    // 73-row board with 33 rows stuck on their template line.
    let done = 0, rejected = 0;
    for (let off = 0; off < missing.length && off < 200; off += 40) {
    if (!geminiGuard()) break;
    // Compact keyed candidates — same discipline as the other Scout jobs: the
    // model never sees a raw id, a url or anything resembling PII.
    const batch = missing.slice(off, off + 40);
    const keyToId = {};
    const compact = batch.map((x, i) => {
      const k = 'e' + i; keyToId[k] = String(x.id);
      // Send the HUMAN duration: given raw minutes the model wrote "a
      // 135-minute activity" in 39 of 40 first-run descriptions.
      return { k, title: (x.title || '').slice(0, 80), category: x.category || null,
               runs: durWords(x.duration), price: x.price ?? null, unit: x.priceUnit || null,
               rating: x.rating ?? null, kind: x.source === 'osm' ? 'place' : 'bookable activity' };
    });
    const prompt = `You are Scout. For each item below, write the ONE line a group reads while deciding what to do on a trip to ${trip?.destination || 'their destination'}.

Items (JSON): ${JSON.stringify(compact)}

THE READER CAN ALREADY SEE the title, how long it runs, the price and the rating — they are printed on the card right above your line. Restating them is wasted space and is the single most common failure here. Your job is the thing the card does NOT say: what the group is actually doing, who it suits, or what to know before picking it.

Write 12-24 words per item, plain and concrete.

Good: "Small groups, lots of stopping and starting — better for people who want photos than a workout."
Bad:  "Hike to the Hollywood Sign with comics and canines on this 90-minute activity for \$17 per guest." (this is just the title and the facts again)

HARD RULES — these describe real places and businesses:
- Use ONLY the facts given above. NEVER invent an address, opening hours, history, a menu, a price, a rating, or any claim about what is inside.
- If all you have is a name and a category, describe the category honestly and say nothing specific.
- Never repeat the title's wording. Never state the duration or the price.
- No marketing voice. Banned: unforgettable, hidden gem, must-see, iconic, breathtaking, nestled.
- No emoji.

Return ONLY JSON: {"d":[{"k":"<key>","t":"<the sentence>"}]}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    const data = await r.json();
    if (!r.ok) { console.error('[describe] gemini', r.status); break; }
    const um = data.usageMetadata || {};
    bumpUsage('gemini', { calls: 1, promptTokens: um.promptTokenCount || 0, candidatesTokens: um.candidatesTokenCount || 0, totalTokens: um.totalTokenCount || 0 });
    const raw = JSON.parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
    const fresh = loadExpAbout(tripId); // re-read: a refresh may have landed meanwhile
    let n = 0, skipped = 0;
    for (const d of Array.isArray(raw.d) ? raw.d : []) {
      const id = keyToId[d?.k];
      const text = typeof d?.t === 'string' ? d.t.trim().replace(/\s+/g, ' ').slice(0, 220) : '';
      if (!id || text.length < 12) continue;
      const row = batch.find((x) => String(x.id) === id);
      // Don't accept a line that just replays the title — the template already
      // says that much, and more honestly. Leave it for a later attempt.
      const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const t = norm(row && row.title);
      if (t.length >= 18 && norm(text).includes(t.slice(0, 24))) { skipped++; continue; }
      fresh[id] = { text, by: 'scout', hash: expAboutHash(row), at: new Date().toISOString() };
      n++;
    }
    saveExpAbout(tripId, fresh);
    done += n; rejected += skipped;
    }
    console.log(`[describe] ${done}/${missing.length} descriptions for ${tripId}${rejected ? ` (${rejected} rejected as title restatements)` : ''}`);
  } catch (e) {
    console.error('[describe]', e.message); // descriptions are a bonus — never fatal
  } finally {
    _describing.delete(tripId);
  }
}

// Open view-by-link, like listings: guests browsing a shared board can see the
// list; only voting requires membership. Lazily kicks off the first scrape.
app.get('/api/trips/:tripId/experiences', loadTripOr404, (req, res) => {
  const tripId = req.params.tripId;
  const rows = loadExperiences(tripId);
  let pending = false;
  try { pending = fs.existsSync(tripFile(tripId, '.exp-searching')); } catch {}
  if (rows.length === 0 && !pending) pending = spawnExperiencesSearch(tripId);
  // Staleness respawn: quietly refresh day-old data in the background (serving
  // the current rows meanwhile). Also how existing files pick up newly-added
  // fields (e.g. originalPrice/priceUnit) after a deploy — no manual refresh.
  else if (!pending) {
    try {
      const ageMs = Date.now() - fs.statSync(tripFile(tripId, 'experiences.json')).mtimeMs;
      // Respawn when stale OR when rows predate a schema addition (missing keys).
      if (ageMs > 24 * 3600 * 1000 || !('originalPrice' in rows[0])) spawnExperiencesSearch(tripId);
    } catch {}
  }
  // Descriptions are cached per row and filled in the background — serve what
  // we have now rather than making the board wait on a model.
  const about = loadExpAbout(tripId);
  const out = rows.map((x) => {
    const a = about[x.id];
    return a ? { ...x, description: a.text, descriptionBy: a.by } : x;
  });
  // Same predicate the fill uses — checking only the hash here meant a row
  // sitting on its template line never triggered an upgrade attempt.
  if (rows.some((x) => aboutNeedsWork(about[x.id], expAboutHash(x)))) fillExpDescriptions(tripId, req.trip);
  res.json({ experiences: out, pending });
});

app.post('/api/trips/:tripId/experiences/refresh', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 3600000, max: 6 }), (req, res) => {
  if (isTripPast(req.trip)) return res.status(409).json({ error: 'This trip has ended.' });
  const started = spawnExperiencesSearch(req.params.tripId);
  res.json({ ok: true, started });
});

app.get('/api/trips/:tripId/exp-votes', loadTripOr404, (req, res) => {
  res.json(loadExpVotes(req.params.tripId));
});

// ── Scout's plan as a ROUTED DAY ─────────────────────────────────────────────
// A grouped list hides the thing that actually breaks a group's day: getting
// between places. So a plan renders as a spine of stop → leg → stop.
//
// The split of labour matters. Scout picks the ORDER and writes the WHY; the
// server computes every NUMBER — clock times, leg distances, drive minutes, the
// day's totals. That is deliberate: a model asked to invent clock times will
// happily produce a day whose arrival times, reasoning and totals disagree with
// each other, and the one thing a plan has to be is internally consistent.
//
// Travel time is an ESTIMATE from straight-line distance, and is labelled "~"
// in the UI. We have no routing provider, and a fabricated-precise "14 min" is
// worse than an honest approximation.
const ROAD_FACTOR = 1.35;   // straight-line → plausible road distance
const CITY_MPH = 22;        // urban average including lights and traffic
const WALK_MI = 0.6;        // under this, a group walks
const DEFAULT_STAY_MIN = 90;

// NOTE the name: there is already a haversineMi(lat1,lng1,lat2,lng2) above that
// rounds and bakes in its own 1.25 road factor. Redeclaring it would silently
// replace that one for its existing callers, so this is deliberately separate —
// it returns the RAW straight-line distance and lets the caller scale it.
function straightLineMi(a, b) {
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const clockOf = (mins) => {
  const h24 = Math.floor(mins / 60) % 24, m = Math.round(mins % 60);
  const ap = h24 < 12 ? 'a' : 'p';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')}${ap}`;
};
const spanOf = (mins) => {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`;
};

/** Where the group's day starts: the decided home, else the trip's ref point. */
function tripAnchor(tripId, trip) {
  try {
    const dec = loadDecision(tripId);
    if (dec) {
      // Curated + submitted only: the scraped pipeline lives in SQLite behind a
      // query, and a missing home just falls through to the trip's ref point.
      const home = [...loadListings(tripId), ...loadSubmitted(tripId)]
        .find((l) => String(l.id) === String(dec.listing_id));
      if (home && typeof home.lat === 'number' && typeof home.lng === 'number') {
        return { name: 'The house', lat: home.lat, lng: home.lng };
      }
    }
  } catch {}
  const rp = (trip && trip.ref_points) || tripRefPoints(tripId) || {};
  const p = rp.downtown || rp.attraction || rp.airport;
  return p && typeof p.lat === 'number' ? { name: p.name || 'Base', lat: p.lat, lng: p.lng } : null;
}

/** One day of the plan → the alternating stop/leg rows the UI draws. */
function routeDay(day, ctx) {
  const { byId, anchor, pins, votes, party, dayStartMin } = ctx;
  const stops = day.items.map((it) => ({ it, x: byId.get(it.id) })).filter((s) => s.x);
  if (!stops.length) return null;

  const rows = [];
  let clock = dayStartMin;
  let driveMins = 0, perPerson = 0, unpriced = 0;
  let here = anchor;

  if (anchor) {
    rows.push({ k: 'anchor', t: clockOf(clock), n: `${anchor.name} · everyone out the door` });
  }

  for (const { it, x } of stops) {
    // Leg in — only when we can actually measure it. No coordinates, no invented leg.
    if (here && typeof x.lat === 'number' && typeof x.lng === 'number') {
      const mi = straightLineMi(here, x) * ROAD_FACTOR;
      const walk = mi <= WALK_MI;
      const mins = Math.max(5, Math.round((walk ? (mi / 3) * 60 : (mi / CITY_MPH) * 60) / 5) * 5);
      rows.push({
        leg: walk ? 'walk' : 'drive',
        dur: `~${mins} min`,
        mi: `${mi.toFixed(1)} mi`,
        tight: mins >= 30,
        // Don't claim it's "the longest" — several legs can trip this.
        why: mins >= 30 ? 'a long haul across town — leave a buffer' : null,
      });
      clock += mins;
      if (!walk) driveMins += mins;
      here = { lat: x.lat, lng: x.lng };
    } else if (typeof x.lat === 'number' && typeof x.lng === 'number') {
      here = { lat: x.lat, lng: x.lng };
    }

    const net = Object.values(votes[x.id] || {}).reduce((n, d) => n + (d === 'up' ? 1 : -1), 0);
    const pp = x.price == null ? null : (x.priceUnit === 'group' ? Math.ceil(x.price / Math.max(1, party)) : x.price);
    if (pp == null) unpriced++; else perPerson += pp;

    const facts = [];
    if (x.duration) facts.push(spanOf(x.duration));
    if (pp === 0) facts.push('free');
    else if (pp != null) facts.push(`$${pp} pp`);
    if (net > 0) facts.push(`${net} of ${party} would go`);

    rows.push({
      k: 'stop', t: clockOf(clock), id: x.id, n: x.title,
      tag: pins[x.id] === day.day ? 'pinned' : net > 0 ? 'voted' : null,
      facts, why: it.why || null,
    });
    clock += x.duration || DEFAULT_STAY_MIN;
  }

  // Name the hole rather than inventing a stop to fill it. An evening that ends
  // before 6pm is a real gap in a group's day, and Scout should say so.
  const EVENING = 18 * 60;
  if (clock < EVENING) {
    rows.push({ gap: `Nothing after ${clockOf(clock)} — the group hasn’t voted on anything for this evening` });
  }

  return {
    win: `${clockOf(dayStartMin)} – ${clockOf(clock)}`,
    out: spanOf(clock - dayStartMin),
    drive: driveMins ? spanOf(driveMins) : null,
    pp: perPerson || null,
    unpriced,
    rows,
  };
}

/** Attach a `route` to each day of a plan. Never throws — the flat list is the
 *  fallback rendering, and a plan without coordinates is still a useful plan. */
function withRoutes(tripId, trip, plan) {
  if (!plan || !Array.isArray(plan.days)) return plan;
  try {
    const ctx = {
      byId: new Map(loadExperiences(tripId).map((x) => [String(x.id), x])),
      anchor: tripAnchor(tripId, trip),
      pins: readJson(tripFile(tripId, 'exp-days.json'), {}),
      votes: loadExpVotes(tripId),
      party: Math.max(1, Number(trip?.adults) || 2),
      dayStartMin: 9 * 60 + 30,
    };
    return { ...plan, days: plan.days.map((d) => ({ ...d, route: routeDay(d, ctx) })) };
  } catch (e) {
    console.error('[route]', e.message);
    return plan;
  }
}

// Experience reviews — free detail-page fetch (fetchExperienceReviews mirrors the
// homes ListingReviews shape + an aggregate summary). Cached per trip for 7 days:
// review churn is slow and the group only needs a flavor. The id must be on the
// trip's own experiences list so this can't be used as an open proxy.
const EXP_REVIEWS_TTL_MS = 7 * 24 * 3600 * 1000;
app.get('/api/trips/:tripId/experiences/:id/reviews', loadTripOr404, rateLimit({ windowMs: 60000, max: 20 }), async (req, res) => {
  const tripId = req.params.tripId;
  const expId = String(req.params.id || '');
  // Namespaced ids: `airbnb:3951041`, `osm:node/123`. Keep the character class
  // tight (no slashes into path segments beyond what providers use, no traversal).
  if (!/^[a-z]+:[A-Za-z0-9/_-]{1,64}$/.test(expId)) return res.status(400).json({ error: 'Invalid experience id' });
  if (!loadExperiences(tripId).some((x) => String(x.id) === expId))
    return res.status(404).json({ error: 'Experience not on this trip' });
  // Guest reviews are an Airbnb-page scrape; other providers have none.
  if (!expId.startsWith('airbnb:')) return res.status(204).json(null);
  const cacheFile = tripFile(tripId, 'exp-reviews.json');
  const cache = readJson(cacheFile, {});
  const hit = cache[expId];
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < EXP_REVIEWS_TTL_MS) return res.json(hit);
  try {
    const { fetchExperienceReviews } = require('./experiences');
    const shaped = await fetchExperienceReviews(expId);
    if (!shaped) return res.status(hit ? 200 : 204).json(hit || null); // soft fail → stale-if-any
    cache[expId] = shaped;
    writeJsonAtomic(cacheFile, cache);
    res.json(shaped);
  } catch (e) {
    console.error('[exp-reviews] fetch failed:', e.message);
    res.status(hit ? 200 : 204).json(hit || null);
  }
});

// ── One-time migration: namespace experience ids ─────────────────────────────
// Experience ids used to be the bare Airbnb id ("3951041"). They key FIVE stores
// (votes, saves, days, reviews, my-plans), so adding any second provider whose
// ids are also numeric would silently collide and land a member's vote on the
// wrong activity. Ids are now `airbnb:3951041`. This rewrites existing per-trip
// data in place, once, guarded by a marker file.
function migrateExperienceIds() {
  const ns = (k) => (/^[a-z]+:/.test(String(k)) ? String(k) : `airbnb:${k}`);
  let trips = {};
  try { trips = loadTrips(); } catch { return; }
  for (const tripId of Object.keys(trips)) {
    let marker;
    try { marker = tripFile(tripId, '.exp-ids-namespaced'); } catch { continue; }
    if (fs.existsSync(marker)) continue;
    try {
      const rewriteKeys = (file) => {
        const f = tripFile(tripId, file);
        const m = readJson(f, null);
        if (!m || typeof m !== 'object') return 0;
        const out = {}; let n = 0;
        for (const [k, v] of Object.entries(m)) { const k2 = ns(k); if (k2 !== k) n++; out[k2] = v; }
        if (n) writeJsonAtomic(f, out);
        return n;
      };
      let touched = 0;
      touched += rewriteKeys('exp-votes.json');
      touched += rewriteKeys('exp-days.json');
      touched += rewriteKeys('exp-reviews.json');

      // experiences.json — an ARRAY of rows
      const ef = tripFile(tripId, 'experiences.json');
      const rows = readJson(ef, null);
      if (Array.isArray(rows) && rows.some((r) => r && !/^[a-z]+:/.test(String(r.id)))) {
        writeJsonAtomic(ef, rows.map((r) => ({ ...r, id: ns(r.id), source: r.source || 'airbnb' })));
        touched++;
      }
      // exp-saves.json — userId → [ids]
      const sf = tripFile(tripId, 'exp-saves.json');
      const saves = readJson(sf, null);
      if (saves && typeof saves === 'object') {
        const out = {}; let n = 0;
        for (const [u, ids] of Object.entries(saves)) {
          out[u] = (Array.isArray(ids) ? ids : []).map((i) => { const j = ns(i); if (j !== i) n++; return j; });
        }
        if (n) { writeJsonAtomic(sf, out); touched += n; }
      }
      // exp-myplans.json — userId → { days:[{ items:[{id}] }] }
      const pf = tripFile(tripId, 'exp-myplans.json');
      const plans = readJson(pf, null);
      if (plans && typeof plans === 'object') {
        let n = 0;
        for (const p of Object.values(plans)) {
          for (const d of (p?.days || [])) for (const it of (d.items || [])) {
            const j = ns(it.id); if (j !== it.id) { it.id = j; n++; }
          }
        }
        if (n) { writeJsonAtomic(pf, plans); touched += n; }
      }
      // exp-plan.json — the GROUP plan, same nested shape
      const gf = tripFile(tripId, 'exp-plan.json');
      const gplan = readJson(gf, null);
      if (gplan && Array.isArray(gplan.days)) {
        let n = 0;
        for (const d of gplan.days) for (const it of (d.items || [])) {
          const j = ns(it.id); if (j !== it.id) { it.id = j; n++; }
        }
        if (n) { writeJsonAtomic(gf, gplan); touched += n; }
      }

      fs.writeFileSync(marker, new Date().toISOString());
      if (touched) console.log(`[migrate] namespaced experience ids for ${tripId} (${touched} change(s))`);
    } catch (e) { console.error(`[migrate] experience ids failed for ${tripId}:`, e.message); }
  }
}

// ── Scout · Plan (Experiences) ────────────────────────────────────────────────
// The 4th Scout job — see docs/specs/scout.md §2. Turns the group's UP-VOTED
// experiences into a day-by-day plan for the trip's dates. Deliberate (never
// automatic), group-shared, cached by a votes+dates hash so re-opening is free,
// with a non-AI fallback so the button always produces something.
function loadExpPlan(tripId) { return readJson(tripFile(tripId, 'exp-plan.json'), null); }
function saveExpPlan(tripId, v) { writeJsonAtomic(tripFile(tripId, 'exp-plan.json'), v); }

// Days of the trip as YYYY-MM-DD (capped — nobody plans 30 days of activities).
function tripDays(trip, cap = 7) {
  const out = [];
  try {
    const start = new Date(`${trip.checkin}T00:00:00`);
    const end = new Date(`${trip.checkout_5n || trip.checkout}T00:00:00`);
    for (let d = new Date(start); d < end && out.length < cap; d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
  } catch {}
  return out;
}

// No-AI fallback: spread the top-voted experiences across the days in vote order.
function heuristicPlan(days, picks) {
  if (!days.length) return [{ day: null, items: picks.slice(0, 6).map((p) => ({ id: p.id, why: null })) }];
  const per = Math.max(1, Math.ceil(Math.min(picks.length, days.length * 2) / days.length));
  return days.map((day, i) => ({ day, items: picks.slice(i * per, i * per + per).map((p) => ({ id: p.id, why: null })) }))
             .filter((d) => d.items.length);
}

app.post('/api/trips/:tripId/plan-experiences', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 3600000, max: 10 }), async (req, res) => {
  const tripId = req.params.tripId;
  const trip = req.trip;
  const rows = loadExperiences(tripId);
  const votes = loadExpVotes(tripId);
  // Candidates = what the group actually likes (net up-votes), best first.
  const netOf = (id) => Object.values(votes[id] || {}).reduce((n, d) => n + (d === 'up' ? 1 : -1), 0);
  const picks = rows.filter((x) => netOf(x.id) >= 1)
                    .sort((a, b) => netOf(b.id) - netOf(a.id) || ((b.rating ?? 0) - (a.rating ?? 0)))
                    .slice(0, 12);
  if (!picks.length) return res.status(400).json({ error: 'Vote on a few things first — Scout plans from what the group likes.' });

  const days = tripDays(trip);
  const hash = crypto.createHash('sha1')
    .update(JSON.stringify(picks.map((p) => [p.id, netOf(p.id)])) + days.join(','))
    .digest('hex');
  const cached = loadExpPlan(tripId);
  if (cached && cached.hash === hash && !req.body?.force) return res.json(withRoutes(tripId, trip, cached));

  const fallback = () => {
    const out = { hash, days: heuristicPlan(days, picks), planned_at: new Date().toISOString(), fallback: true };
    saveExpPlan(tripId, out);
    return withRoutes(tripId, trip, out);
  };
  if (!GEMINI_API_KEY || !geminiGuard()) return res.json(fallback());

  // Compact, keyed candidates — same discipline as ai-rank (never raw ids/PII).
  const keyToId = {};
  const compact = picks.map((p, i) => {
    const k = 'e' + i; keyToId[k] = String(p.id);
    return {
      k, title: (p.title || '').slice(0, 70), category: p.category,
      price: p.price, unit: p.priceUnit || 'guest', mins: p.duration,
      rating: p.rating, likes: netOf(p.id),
    };
  });
  const prompt = `You are Scout, planning what a group of ${trip.adults || 2} will DO on a trip to ${trip.destination}. They already voted on these activities; higher "likes" means the group wants it more.

Activities (JSON): ${JSON.stringify(compact)}
Trip days: ${days.length ? days.join(', ') : 'unknown dates — just group them sensibly'}

Build a realistic day-by-day plan. Rules: at most 2 activities per day; keep total time per day under ~6 hours (use "mins"); put the most-liked activities on earlier days; don't repeat an activity; it's fine to leave a day empty for rest. Only use the activities given.

IMPORTANT about "why": we compute the actual clock times ourselves from your ordering, the durations and the travel between places — you do not control them. So NEVER claim a time of day ("sunset", "after dark", "a morning session", "lands as lunch", "7pm"). A "why" that names a time will contradict the schedule we render next to it. Say why it suits THE GROUP or why it sits well beside the other activity that day instead.
Return ONLY JSON: {"days":[{"day":"<one of the trip days, or null>","items":[{"k":"<key>","why":"<≤12 words, no time-of-day claims>"}]}]}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    const data = await r.json();
    if (!r.ok) { console.error('[plan-experiences] gemini', r.status); return res.json(fallback()); }
    const um = data.usageMetadata || {};
    bumpUsage('gemini', { calls: 1, promptTokens: um.promptTokenCount || 0, candidatesTokens: um.candidatesTokenCount || 0, totalTokens: um.totalTokenCount || 0 });
    const raw = JSON.parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
    const used = new Set();
    const planDays = (Array.isArray(raw.days) ? raw.days : [])
      .map((d) => ({
        day: typeof d.day === 'string' && days.includes(d.day) ? d.day : null,
        items: (Array.isArray(d.items) ? d.items : [])
          .filter((it) => it && keyToId[it.k] && !used.has(it.k) && used.add(it.k) !== false)
          .map((it) => ({ id: keyToId[it.k], why: typeof it.why === 'string' ? it.why.trim().slice(0, 90) : null })),
      }))
      .filter((d) => d.items.length);
    if (!planDays.length) return res.json(fallback());
    const out = { hash, days: planDays, planned_at: new Date().toISOString() };
    saveExpPlan(tripId, out);
    // Routes are computed at READ time, never stored: votes, pins and the
    // decided home all move underneath a plan that is otherwise still valid.
    res.json(withRoutes(tripId, trip, out));
  } catch (e) {
    console.error('[plan-experiences]', e.message);
    res.json(fallback());
  }
});

app.get('/api/trips/:tripId/exp-plan', loadTripOr404, (req, res) =>
  res.json(withRoutes(req.params.tripId, req.trip, loadExpPlan(req.params.tripId))));

// ── Phase 4 · assign-to-day ───────────────────────────────────────────────────
// The group PINNING an activity to a specific day ("we're doing the hike Thursday").
// Distinct from Scout's Plan: this is the human override, and it always wins.
function loadExpDays(tripId) { return readJson(tripFile(tripId, 'exp-days.json'), {}); }
function saveExpDays(v, tripId) { writeJsonAtomic(tripFile(tripId, 'exp-days.json'), v); }

app.get('/api/trips/:tripId/exp-days', loadTripOr404, (req, res) => res.json(loadExpDays(req.params.tripId)));

app.post('/api/trips/:tripId/exp-days', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 60 }), (req, res) => {
  const tripId = req.params.tripId;
  const { experience_id, day } = req.body || {};
  if (!experience_id || UNSAFE_KEY.test(String(experience_id)))
    return res.status(400).json({ error: 'expected { experience_id, day: "YYYY-MM-DD"|null }' });
  if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')))
    return res.status(400).json({ error: 'day must be YYYY-MM-DD or null' });
  // Only days inside the trip window — no pinning an activity to next year.
  if (day !== null && !tripDays(req.trip, 14).includes(day))
    return res.status(400).json({ error: 'That day is outside the trip.' });
  const map = loadExpDays(tripId);
  if (day === null) delete map[experience_id];
  else map[experience_id] = day;
  saveExpDays(map, tripId);
  res.json(map);
});

// The trip's days, so the client can render a day picker without re-deriving them.
app.get('/api/trips/:tripId/days', loadTripOr404, (req, res) => res.json({ days: tripDays(req.trip, 14) }));

// ── Personal lane: saved experiences + your own plan ─────────────────────────
// Mirrors homes favorites (userId → [ids]) — private to each member. The group
// lane stays the vote leaderboard; this is "my plan", which can be shared.
function loadExpSaves(tripId) { return readJson(tripFile(tripId, 'exp-saves.json'), {}); }
function saveExpSaves(v, tripId) { writeJsonAtomic(tripFile(tripId, 'exp-saves.json'), v); }
function loadMyPlans(tripId) { return readJson(tripFile(tripId, 'exp-myplans.json'), {}); }
function saveMyPlans(v, tripId) { writeJsonAtomic(tripFile(tripId, 'exp-myplans.json'), v); }

app.get('/api/trips/:tripId/exp-saves', requireAuth, loadTripOr404, (req, res) => {
  res.json({ ids: loadExpSaves(req.params.tripId)[req.user.id] || [] });
});

app.post('/api/trips/:tripId/exp-saves', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 90 }), (req, res) => {
  const id = String((req.body && req.body.experience_id) || '').slice(0, 80);
  if (!id || UNSAFE_KEY.test(id)) return res.status(400).json({ error: 'experience_id required' });
  const all = loadExpSaves(req.params.tripId);
  const set = new Set(all[req.user.id] || []);
  const on = req.body && req.body.on;
  if (on === false || (on == null && set.has(id))) set.delete(id); else set.add(id);
  all[req.user.id] = [...set];
  saveExpSaves(all, req.params.tripId);
  res.json({ ids: all[req.user.id] });
});

// "My plan" — the personal counterpart of the group plan. Scout plans from the
// ids the member picked (their saves / selection), stored per user so it can be
// shared as a link ("this is my plan") without touching the group's plan.
app.post('/api/trips/:tripId/my-plan', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 3600000, max: 20 }), async (req, res) => {
  const tripId = req.params.tripId;
  const trip = req.trip;
  const rows = loadExperiences(tripId);
  const wanted = Array.isArray(req.body?.ids) && req.body.ids.length
    ? req.body.ids.map(String)
    : (loadExpSaves(tripId)[req.user.id] || []);
  const picks = rows.filter((x) => wanted.includes(String(x.id))).slice(0, 12);
  if (!picks.length) return res.status(400).json({ error: 'Save or select a few things first.' });

  const days = tripDays(trip);
  const build = async () => {
    if (!GEMINI_API_KEY || !geminiGuard()) return { days: heuristicPlan(days, picks), fallback: true };
    const keyToId = {};
    const compact = picks.map((p, i) => {
      const k = 'e' + i; keyToId[k] = String(p.id);
      return { k, title: (p.title || '').slice(0, 70), category: p.category, price: p.price, mins: p.duration, rating: p.rating };
    });
    const prompt = `You are Scout, planning ONE person's days on a trip to ${trip.destination}. These are the activities THEY chose.

Activities (JSON): ${JSON.stringify(compact)}
Trip days: ${days.length ? days.join(', ') : 'unknown'}

Build a realistic day-by-day plan: at most 2 per day, under ~6 hours a day (use "mins"), no repeats, empty days are fine. Only use what's given.
Return ONLY JSON: {"days":[{"day":"<a trip day or null>","items":[{"k":"<key>","why":"<≤12 words>"}]}]}`;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }),
      });
      const data = await r.json();
      if (!r.ok) return { days: heuristicPlan(days, picks), fallback: true };
      const um = data.usageMetadata || {};
      bumpUsage('gemini', { calls: 1, promptTokens: um.promptTokenCount || 0, candidatesTokens: um.candidatesTokenCount || 0, totalTokens: um.totalTokenCount || 0 });
      const raw = JSON.parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
      const used = new Set();
      const out = (Array.isArray(raw.days) ? raw.days : []).map((d) => ({
        day: typeof d.day === 'string' && days.includes(d.day) ? d.day : null,
        items: (Array.isArray(d.items) ? d.items : [])
          .filter((it) => it && keyToId[it.k] && !used.has(it.k) && used.add(it.k) !== false)
          .map((it) => ({ id: keyToId[it.k], why: typeof it.why === 'string' ? it.why.trim().slice(0, 90) : null })),
      })).filter((d) => d.items.length);
      return out.length ? { days: out } : { days: heuristicPlan(days, picks), fallback: true };
    } catch { return { days: heuristicPlan(days, picks), fallback: true }; }
  };

  const built = await build();
  const all = loadMyPlans(tripId);
  all[req.user.id] = {
    ...built,
    owner_name: (req.user.name || 'A member').split(' ')[0],
    planned_at: new Date().toISOString(),
  };
  saveMyPlans(all, tripId);
  res.json(all[req.user.id]);
});

app.get('/api/trips/:tripId/my-plan', requireAuth, loadTripOr404, (req, res) => {
  res.json(loadMyPlans(req.params.tripId)[req.user.id] || null);
});

// Public read for the share page (no auth: the URL is the secret, same model as
// the board share links).
app.get('/api/trips/:tripId/plans/:userId', loadTripOr404, (req, res) => {
  const p = loadMyPlans(req.params.tripId)[req.params.userId];
  if (!p) return res.status(404).json({ error: 'No plan yet' });
  const byId = new Map(loadExperiences(req.params.tripId).map((x) => [String(x.id), x]));
  res.json({
    owner_name: p.owner_name || 'A member', planned_at: p.planned_at, fallback: !!p.fallback,
    trip: { name: req.trip.name, destination: req.trip.destination, checkin: req.trip.checkin, checkout: req.trip.checkout_5n },
    days: p.days.map((d) => ({
      day: d.day,
      items: d.items.map((it) => {
        const x = byId.get(String(it.id));
        return x ? { id: x.id, title: x.title, photo: x.photo, price: x.price, priceUnit: x.priceUnit, duration: x.duration, url: x.url, why: it.why } : null;
      }).filter(Boolean),
    })).filter((d) => d.items.length),
  });
});

// Same contract as home votes (identity from the session, up/down/null toggle),
// but NOT gated on voting_closed — closing the home vote shouldn't stop the
// group planning what to do.
app.post('/api/trips/:tripId/exp-votes', requireAuth, loadTripOr404, requireTripMember, rateLimit({ windowMs: 60000, max: 90 }), (req, res) => {
  const tripId = req.params.tripId;
  const { experience_id, vote } = req.body || {};
  if (!experience_id || !['up', 'down', null].includes(vote))
    return res.status(400).json({ error: 'expected { experience_id, vote: "up"|"down"|null }' });
  if (UNSAFE_KEY.test(String(experience_id))) return res.status(400).json({ error: 'Invalid experience id' });
  const voter = req.user.id;
  const votes = loadExpVotes(tripId);
  if (!Object.prototype.hasOwnProperty.call(votes, experience_id)) votes[experience_id] = {};
  if (vote === null) delete votes[experience_id][voter];
  else votes[experience_id][voter] = vote;
  saveExpVotes(votes, tripId);
  res.json(votes);
});

// Organizer: fetch reviews for every listing still missing them (one click, guarded).
const hRefreshReviews = async (req, res) => {
  const tripId = req.params.tripId;
  if (!(await apifyGuard('a reviews refresh')))
    return res.status(429).json({ error: 'Reviews are paused — Apify usage is near its monthly limit.' });
  const force = !!(req.body && req.body.force);
  const seen = new Set();
  const listings = [...(loadListings(tripId).listings || []), ...loadSubmitted(tripId)]
    .filter(l => l && l.url && parseListingUrl(l.url))
    .filter(l => { const k = `${l.source}:${l.id}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 40); // hard cap to bound spend
  const map = loadReviews(tripId);
  let fetched = 0, skipped = 0;
  for (const l of listings) {
    const key = `${l.source}:${l.id}`;
    if (map[key] && !force) { skipped++; continue; }
    const shaped = await fetchListingReviews(l.source, l.url, 20);
    if (shaped) { map[key] = shaped; fetched++; }
  }
  saveReviews(map, tripId);
  res.json({ fetched, skipped, total: listings.length });
};
app.post('/api/admin/reviews/refresh-all', requireAdmin, hRefreshReviews);
app.post('/api/trips/:tripId/reviews/refresh-all', requireTripOwner, hRefreshReviews);

// ── Walkthrough tours: cached map (free) + organizer/auto generation ────────────
const hGetTours = (req, res) => res.json(loadTours(req.params.tripId));
app.get('/api/tours', hGetTours);
app.get('/api/trips/:tripId/tours', loadTripOr404, hGetTours);

const hGenTour = async (req, res) => {
  if (!falConfigured()) return res.status(503).json({ error: 'Video tours aren’t configured yet (FAL_KEY missing on server).' });
  const t = await ensureTour(req.params.tripId, req.params.listingId, { force: !!(req.body && req.body.force), bypassCap: isSuperAdmin(req.user) });
  if (!t) return res.status(400).json({ error: 'Could not start a tour — no photos for this listing, or the per-trip tour cap was reached.' });
  res.json(t);
};
app.post('/api/admin/tours/:listingId/generate', requireAdmin, hGenTour);
app.post('/api/trips/:tripId/tours/:listingId/generate', requireTripOwner, hGenTour);

// Admin one-off: re-fetch photos for a trip's curated listings (now up to 16 each,
// so exteriors get captured for tours). Only replaces photos when it finds more.
app.post('/api/admin/refetch-photos', requireAdmin, async (req, res) => {
  const tripId = (req.body && req.body.tripId) || LA_TRIP_ID;
  const data = loadListings(tripId);
  const out = [];
  for (const l of (data.listings || [])) {
    const before = (l.photos || []).length;
    const parsed = l.url ? parseListingUrl(l.url) : null;
    if (!parsed) { out.push({ id: l.id, before, after: before, note: 'no url' }); continue; }
    try {
      const scraped = await scrapeListingDetails(l.url.split('?')[0], parsed, tripDates(getTrip(tripId)));
      if (scraped.photos && scraped.photos.length > before) l.photos = scraped.photos;
      out.push({ id: l.id, before, after: (l.photos || []).length });
    } catch (e) { out.push({ id: l.id, before, after: before, error: e.message }); }
  }
  saveListings(data, tripId);
  res.json({ updated: out });
});

// ── Admin: Apify token usage (current month spend vs the $5 free cap) ───────────
app.get('/api/admin/apify-usage', requireAdmin, async (req, res) => {
  const token = getApifyToken();
  if (!token) return res.status(400).json({ error: 'No Apify key set on server' });
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

// ── Admin: consolidated API usage across Apify, Firecrawl & Gemini ──────────────
// One screen instead of three popups. Apify = live $ spend; Firecrawl = live
// credit balance; Gemini = app-side token meter (no per-key billing API exists)
// turned into an *estimated* dollar cost from published gemini-2.5-flash rates.
const GEMINI_IN_RATE  = Number(process.env.GEMINI_IN_RATE  ?? 0.30) / 1e6; // $/input token
const GEMINI_OUT_RATE = Number(process.env.GEMINI_OUT_RATE ?? 2.50) / 1e6; // $/output token

async function fetchFirecrawlCredits() {
  if (!process.env.FIRECRAWL_API_KEY) return null;
  for (const url of ['https://api.firecrawl.dev/v2/team/credit-usage', 'https://api.firecrawl.dev/v1/team/credit-usage']) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` } });
      if (!r.ok) continue;
      const d = await r.json();
      const remaining = d?.data?.remaining_credits ?? d?.remaining_credits ?? null;
      const plan      = d?.data?.plan_credits ?? d?.plan_credits ?? null;
      if (remaining != null || plan != null) return { remaining, plan };
    } catch { /* try next path */ }
  }
  return null;
}

async function fetchApifySummary(token = _activeApify) {
  if (!token) return null;
  try {
    const [limitsR, runsR] = await Promise.all([
      fetch(`https://api.apify.com/v2/users/me/limits?token=${token}`),
      fetch(`https://api.apify.com/v2/actor-runs?token=${token}&limit=8&desc=1`),
    ]);
    // A revoked/invalid key answers 401/403 — surface that explicitly so the
    // guard can SKIP it and rotate, instead of reading null usage as headroom.
    if (limitsR.status === 401 || limitsR.status === 403) return { invalid: true };
    const limits = await limitsR.json();
    const runs   = await runsR.json();
    const usageUsd = limits?.data?.current?.monthlyUsageUsd ?? limits?.data?.monthlyUsageUsd ?? null;
    const limitUsd = limits?.data?.limits?.maxMonthlyUsageUsd ?? limits?.data?.maxMonthlyUsageUsd ?? null;
    const recent = (runs?.data?.items || []).map(r => ({
      startedAt: r.startedAt, status: r.status, costUsd: r.usageTotalUsd ?? null,
    }));
    return { usageUsd, limitUsd, recent };
  } catch (e) { console.error('[usage/apify]', e.message); return null; }
}

app.get('/api/admin/usage', requireAdmin, async (req, res) => {
  const month = usageMonth();
  const meter = (loadUsage()[month]) || {};
  const g = meter.gemini || {};
  const promptTokens = g.promptTokens || 0;
  const candidatesTokens = g.candidatesTokens || 0;
  const estCostUsd = promptTokens * GEMINI_IN_RATE + candidatesTokens * GEMINI_OUT_RATE;

  // fal walkthrough video — app-side clip meter → estimated $ (no live spend API).
  const f = meter.fal || {};
  const falSeconds = f.seconds || 0;
  const falEstUsd = falSeconds * FAL_RATE_PER_SEC;

  const [firecrawl, apify] = await Promise.all([fetchFirecrawlCredits(), fetchApifySummary()]);

  // Group pulse — a quick read on engagement, no per-user detail exposed.
  const votesObj = loadVotes();
  const votes = Object.values(votesObj).reduce((n, m) => n + Object.keys(m || {}).length, 0);
  let trip = null;
  try { trip = (loadListings() || {}).trip || null; } catch { /* ignore */ }

  res.json({
    month,
    gemini: {
      configured: !!process.env.GEMINI_API_KEY,
      model: GEMINI_MODEL,
      calls: g.calls || 0,
      promptTokens, candidatesTokens,
      totalTokens: g.totalTokens || (promptTokens + candidatesTokens),
      estCostUsd,
      rates: { inputPerM: GEMINI_IN_RATE * 1e6, outputPerM: GEMINI_OUT_RATE * 1e6 },
    },
    firecrawl: {
      configured: !!process.env.FIRECRAWL_API_KEY,
      callsThisMonth: (meter.firecrawl && meter.firecrawl.calls) || 0,
      remainingCredits: firecrawl ? firecrawl.remaining : null,
      planCredits: firecrawl ? firecrawl.plan : null,
    },
    apify: {
      configured: apifyConfigured(),
      spentUsd: apify ? apify.usageUsd : null,
      limitUsd: apify ? apify.limitUsd : null,
      recent: apify ? apify.recent : [],
    },
    fal: {
      configured: falConfigured(),
      model: FAL_MODEL,
      clips: f.submits || 0,
      seconds: falSeconds,
      estCostUsd: falEstUsd,
      ratePerSec: FAL_RATE_PER_SEC,
    },
    group: {
      members: Object.keys(loadUsers()).length,
      trips: Object.keys(loadTrips()).length,
      votes,
      picks: Object.keys(loadFinalVotes()).length,
      submissions: loadSubmitted().length,
      decisionLocked: !!loadDecision(),
      refreshedAt: trip ? trip.refreshed_at : null,
    },
  });
});

// Super-admin: per-trip platform stats for the admin "Recent trips" table.
// Real engagement only (members/homes/votes/pick) — per-trip API cost isn't metered.
app.get('/api/admin/trips', requireAdmin, (req, res) => {
  const trips = loadTrips();
  const rows = Object.values(trips).map((t) => {
    const id = t.id;
    const homes = ((loadListings(id).listings) || []).length + (loadSubmitted(id) || []).length;
    const votesObj = loadVotes(id);
    const votes = Object.values(votesObj).reduce((n, m) => n + Object.keys(m || {}).length, 0);
    const locked = !!loadDecision(id);
    const state = locked ? 'locked' : (votes > 0 || homes > 0) ? 'active' : 'idle';
    return {
      id, name: t.name || 'Untitled trip',
      members: Array.isArray(t.members) ? t.members.length : 0,
      homes, votes, locked, state,
      created_at: t.created_at || null,
    };
  });
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  res.json({ trips: rows });
});

// Spawn the trip-scoped rental search (pipeline.js in TRIP_ID mode) for a newly
// created trip. Writes a .searching marker immediately so the client's status
// poll is accurate from t=0; pipeline.js clears it when the run finishes.
function spawnTripSearch(tripId, maxItems, notify = false) {
  if (tripId === LA_TRIP_ID) return false;
  // Decided or past → stop updating. (Airbnb discovery is self-hosted so no Apify
  // key is required; the actor is only a fallback.)
  const t = getTrip(tripId);
  if (t && isTripDormant(t)) {
    console.log(`[trip-search] skipped for ${tripId} — trip is ${isTripSettled(t) ? 'decided' : 'past'}`);
    return false;
  }
  try { fs.writeFileSync(path.join(tripDir(tripId), '.searching'), new Date().toISOString()); } catch {}
  const { spawn } = require('child_process');
  const env = { ...process.env, TRIP_ID: tripId, APIFY_TOKEN: getApifyToken() };
  if (maxItems) env.TRIP_SEARCH_MAX = String(maxItems);
  const child = spawn('node', ['pipeline.js'], { cwd: __dirname, env, detached: true, stdio: 'ignore' });
  // Notify members of fresh homes on a *refresh* (not the initial create search).
  if (notify) child.on('exit', (code) => { if (code === 0) notifyFreshHomes(tripId); });
  child.unref();
  console.log(`[trip-search] spawned for ${tripId} (cap ${maxItems || 'default'})`);
  return true;
}

// ── Trips: create / list mine / view / join / leave ────────────────────────────
// List the trips the signed-in user owns or has joined.
app.get('/api/me/trips', requireAuth, (req, res) => {
  const trips = loadTrips();
  const mine = Object.values(trips)
    .filter(t => t.owner_id === req.user.id || (Array.isArray(t.members) && t.members.includes(req.user.id)))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map(t => ({ ...tripView(t, req.user), coverPhoto: tripCoverPhoto(t.id) }));
  res.json({ trips: mine });
});

// Create a new trip; the caller becomes the organizer.
app.post('/api/trips', requireAuth, rateLimit({ windowMs: 3600000, max: 12 }), (req, res) => {
  const { name, destination, checkin, checkout_5n, adults, budget, bedrooms, home_type, flex_days, itinerary } =
    req.body || {};
  if (!destination || !String(destination).trim())
    return res.status(400).json({ error: 'Destination is required.' });
  if (!checkin || !checkout_5n)
    return res.status(400).json({ error: 'Check-in and check-out dates are required.' });
  const trip = createTrip(req.user, { name, destination, checkin, checkout_5n, adults, budget, bedrooms, home_type, flex_days });
  // Optional UI theme chosen at create time → the trip's default skin.
  const newSkin = cleanSkin((req.body || {}).skin);
  if (newSkin && newSkin !== 'classic') {
    const trips = loadTrips();
    if (trips[trip.id]) { trips[trip.id].skin = newSkin; saveTrips(trips); trip.skin = newSkin; }
  }
  // Optional itinerary posted at create time — saved before the search so it can
  // inform the reference points, and so AI compare has it from the start.
  const itinText = String(itinerary || '').slice(0, 8000).trim();
  if (itinText) saveItinerary({ text: itinText, updated_at: new Date().toISOString() }, trip.id);
  // Kick off a capped rental search for the new trip — but only if Apify isn't
  // near its limit (background; never blocks trip creation).
  apifyGuard('a new trip search')
    .then(ok => { if (ok) spawnTripSearch(trip.id, Number(process.env.TRIP_SEARCH_MAX) || 10); })
    .catch(() => {});
  res.json(tripView(trip, req.user));
});

// View a trip (open — the unguessable id is the view-by-link secret).
app.get('/api/trips/:tripId', (req, res) => {
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(tripView(trip, req.user));
});

// Join a trip via its invite code (from the share link).
app.post('/api/trips/:tripId/join', requireAuth, (req, res) => {
  const trip = getTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const code = (req.body && req.body.join_code) || '';
  // The invite code is REQUIRED when one is set — an empty/missing or wrong code
  // is rejected (previously an empty code short-circuited the check and joined).
  if (trip.join_code && code !== trip.join_code)
    return res.status(403).json({ error: 'This invite link is invalid or has changed. Ask the organizer for a fresh one.' });
  noteJoin(trip.id, req.user);
  res.json(tripView(getTrip(trip.id), req.user));
});

// Leave a trip (the organizer cannot leave their own).
app.post('/api/trips/:tripId/leave', requireAuth, (req, res) => {
  const trips = loadTrips();
  const trip = trips[req.params.tripId];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.owner_id === req.user.id)
    return res.status(400).json({ error: 'The organizer cannot leave their own trip.' });
  trip.members = (trip.members || []).filter(id => id !== req.user.id);
  saveTrips(trips);
  purgeNonMemberActivity(trip.id); // drop their likes + top pick (keep listings)
  res.json({ ok: true });
});

// Organizer: invite people by email (each gets a one-tap join link). "You're invited."
app.post('/api/trips/:tripId/invite', requireTripOwner, rateLimit({ windowMs: 60000, max: 6 }), async (req, res) => {
  const trip = req.trip;
  const raw = String((req.body && req.body.emails) || '');
  const emails = [...new Set(raw.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(isEmail))].slice(0, 25);
  if (!emails.length) return res.status(400).json({ error: 'Enter at least one valid email address.' });
  // Use the scenario share route so a forwarded invite still previews nicely.
  const link = `${APP_BASE_URL}/s/i/${encodeURIComponent(trip.id)}?c=${encodeURIComponent(trip.join_code)}`;
  const inviter = req.user.name || 'The organizer';
  let sent = 0;
  for (const e of emails) {
    const html = Emails.invite({
      appBase: APP_BASE_URL, tripName: trip.name, destination: trip.destination, inviter, link,
      guests: trip.adults || undefined,
    });
    if (await sendEmail(e, `You're invited: ${trip.name}`, html)) sent++;
  }
  res.json({ sent, attempted: emails.length });
});

// The resolved member roster (who's coming). Any member can see names, avatars
// and roles — the group is transparent. Emails are organizer-only.
app.get('/api/trips/:tripId/members', requireTripMember, (req, res) => {
  const trip = req.trip;
  const users = loadUsers();
  const viewerIsOrg = isOrganizer(trip, req.user);
  const orgs = Array.isArray(trip.organizers) ? trip.organizers : [];
  const list = (trip.members || []).map((id) => {
    const u = users[id] || {};
    const creator = id === trip.owner_id;
    return {
      id,
      name: u.name || (u.email ? u.email.split('@')[0] : 'Member'),
      avatar: u.avatar || null,
      role: creator || orgs.includes(id) ? 'organizer' : 'member',
      isCreator: creator,
      isYou: id === req.user.id,
      ...(viewerIsOrg ? { email: u.email || '' } : {}), // emails: organizers only
    };
  });
  // creator first, then other organizers, then members alphabetical
  const rank = (m) => (m.isCreator ? 0 : m.role === 'organizer' ? 1 : 2);
  list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  res.json({ members: list, canManageOrganizers: isCreator(trip, req.user) });
});

// Organizer: edit trip settings. Members keep their votes.
app.patch('/api/trips/:tripId', requireTripOwner, (req, res) => {
  const trips = loadTrips();
  const trip = trips[req.params.tripId];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);

  if (has('name') && !String(b.name).trim()) return res.status(400).json({ error: 'Give the trip a name.' });
  if (has('destination') && !String(b.destination).trim()) return res.status(400).json({ error: 'Add a destination.' });
  const cin = has('checkin') ? b.checkin : trip.checkin;
  const cout = has('checkout_5n') ? b.checkout_5n : trip.checkout_5n;
  if (cin && cout && cout <= cin) return res.status(400).json({ error: 'Check-out must be after check-in.' });
  if (has('adults') && Number(b.adults) < 2) return res.status(400).json({ error: 'Guests must be 2 or more.' });
  if (has('budget') && Number(b.budget) <= 0) return res.status(400).json({ error: 'Enter a budget.' });

  if (has('name')) trip.name = String(b.name).trim().slice(0, 120);
  if (has('destination')) trip.destination = String(b.destination).trim().slice(0, 120);
  if (has('checkin')) trip.checkin = b.checkin;
  if (has('checkout_5n')) trip.checkout_5n = b.checkout_5n;
  if (has('adults')) trip.adults = Math.max(2, Number(b.adults) || 2);
  if (has('budget')) trip.budget = Math.max(0, Number(b.budget) || 0);
  if (has('home_type')) trip.home_type = String(b.home_type || 'Any');
  if (has('bedrooms')) trip.bedrooms = b.bedrooms == null || b.bedrooms === '' ? null : Math.max(1, Number(b.bedrooms));
  if (has('flex_days')) trip.flex_days = Math.min(14, Math.max(0, Number(b.flex_days) || 0));
  if (has('voting_closed')) trip.voting_closed = !!b.voting_closed;
  if (has('skin')) { const s = cleanSkin(b.skin); if (s) trip.skin = s; }
  saveTrips(trips);
  res.json(tripView(trip, req.user));
});

// Creator: hand the CREATOR role to another member (full handover). The old
// creator stays on as a co-organizer so they keep their powers.
app.post('/api/trips/:tripId/transfer', requireTripCreator, (req, res) => {
  const trips = loadTrips();
  const trip = trips[req.params.tripId];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const userId = String((req.body && req.body.userId) || '');
  if (!userId || !(trip.members || []).includes(userId))
    return res.status(400).json({ error: 'That person is not a member of this trip.' });
  const prevCreator = trip.owner_id;
  trip.organizers = (trip.organizers || []).filter((id) => id !== userId); // new creator no longer needs to be listed
  if (prevCreator && prevCreator !== userId && !trip.organizers.includes(prevCreator)) trip.organizers.push(prevCreator);
  trip.owner_id = userId;
  saveTrips(trips);
  // Tell the new creator they now own the trip.
  try {
    const u = loadUsers()[userId];
    if (u && isEmail(u.email)) {
      const html = Emails.creatorTransferred({
        appBase: APP_BASE_URL, tripName: trip.name, from: req.user.name || '',
        boardUrl: boardUrl(trip.id), manageUrl: `${APP_BASE_URL}/#/t/${trip.id}/manage`,
        unsub: unsubToken(u.id),
      });
      sendEmail(u.email, `You're now the creator of ${trip.name}`, html).catch(() => {});
    }
  } catch (e) { console.error('[creatorTransferred email]', e.message); }
  res.json(tripView(trip, req.user));
});

// Organizer: promote a member to co-organizer (organizers can create organizers).
app.post('/api/trips/:tripId/organizers', requireTripOwner, (req, res) => {
  const trips = loadTrips();
  const trip = trips[req.params.tripId];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const userId = String((req.body && req.body.userId) || '');
  if (!userId || !(trip.members || []).includes(userId))
    return res.status(400).json({ error: 'That person needs to join the trip first.' });
  if (userId === trip.owner_id) return res.status(400).json({ error: 'The creator is already an organizer.' });
  trip.organizers = trip.organizers || [];
  const already = trip.organizers.includes(userId);
  if (!already) trip.organizers.push(userId);
  saveTrips(trips);
  // Let the new organizer know what they can do now.
  if (!already) {
    try {
      const u = loadUsers()[userId];
      if (u && isEmail(u.email)) {
        const html = Emails.organizerAdded({
          appBase: APP_BASE_URL, tripName: trip.name,
          promotedBy: req.user.name || 'An organizer',
          boardUrl: boardUrl(trip.id), manageUrl: `${APP_BASE_URL}/#/t/${trip.id}/manage`,
          unsub: unsubToken(u.id),
        });
        sendEmail(u.email, `You're now an organizer of ${trip.name}`, html).catch(() => {});
      }
    } catch (e) { console.error('[organizerAdded email]', e.message); }
  }
  res.json(tripView(trip, req.user));
});

// Demote a co-organizer back to member. The creator can demote anyone; an
// organizer may step themselves down. The creator can never be demoted.
app.post('/api/trips/:tripId/organizers/remove', requireTripOwner, (req, res) => {
  const trips = loadTrips();
  const trip = trips[req.params.tripId];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const userId = String((req.body && req.body.userId) || '');
  if (userId === trip.owner_id) return res.status(400).json({ error: 'The trip creator cannot be removed as organizer.' });
  const allowed = isCreator(trip, req.user) || userId === req.user.id; // creator, or stepping down
  if (!allowed) return res.status(403).json({ error: 'Only the trip creator can remove another organizer.' });
  trip.organizers = (trip.organizers || []).filter((id) => id !== userId);
  saveTrips(trips);
  res.json(tripView(trip, req.user));
});

// Organizer: remove a member from the trip. The creator can never be removed,
// and a co-organizer can only be removed by the creator.
app.post('/api/trips/:tripId/members/remove', requireTripOwner, (req, res) => {
  const trips = loadTrips();
  const trip = trips[req.params.tripId];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const userId = String((req.body && req.body.userId) || '');
  if (userId === trip.owner_id) return res.status(400).json({ error: 'The trip creator cannot be removed.' });
  const isOrg = Array.isArray(trip.organizers) && trip.organizers.includes(userId);
  if (isOrg && !isCreator(trip, req.user)) return res.status(403).json({ error: 'Only the creator can remove another organizer.' });
  trip.members = (trip.members || []).filter((id) => id !== userId);
  trip.organizers = (trip.organizers || []).filter((id) => id !== userId);
  saveTrips(trips);
  purgeNonMemberActivity(trip.id); // drop their likes + top pick (keep listings)
  res.json({ ok: true });
});

// Per-user email notification preferences (digest + instant).
app.get('/api/me/notifications', requireAuth, (req, res) => res.json(notifPrefs(req.user)));
app.post('/api/me/notifications', requireAuth, (req, res) => {
  const users = loadUsers();
  const u = users[req.user.id];
  if (!u) return res.status(404).json({ error: 'No account.' });
  const b = req.body || {};
  const cur = notifPrefs(u);
  u.notif = {
    digest: b.digest !== undefined ? !!b.digest : cur.digest,
    instant: b.instant !== undefined ? !!b.instant : cur.instant,
  };
  saveUsers(users);
  res.json(notifPrefs(u));
});

// One-click unsubscribe from the email footer (token, no auth). Turns all off.
app.get('/api/notify/unsubscribe', (req, res) => {
  const token = String(req.query.u || '');
  const users = loadUsers();
  const entry = token && Object.values(users).find(u => u.unsub && u.unsub === token);
  if (entry) { entry.notif = { digest: false, instant: false }; saveUsers(users); }
  res.set('Content-Type', 'text/html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${entry ? 'Unsubscribed' : 'Link expired'}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1115;color:#e7e9ee;display:flex;min-height:92vh;align-items:center;justify-content:center;text-align:center">
<div style="max-width:440px;padding:24px">
<h1 style="font-size:22px;margin:0 0 10px">${entry ? "You're unsubscribed" : 'Link expired'}</h1>
<p style="color:#9aa0aa;font-size:15px;line-height:1.6">${entry ? "You won't get any more GroupPad trip emails. You can turn them back on anytime from your account settings." : "We couldn't find that unsubscribe link — it may already have been used."}</p>
<p style="margin-top:22px"><a href="${APP_BASE_URL}" style="color:#6ea0ff;text-decoration:none">Back to GroupPad &rarr;</a></p>
</div></body></html>`);
});

// Organizer: (re)run the rental search for this trip (capped).
app.post('/api/trips/:tripId/run-search', requireTripOwner, async (req, res) => {
  if (req.params.tripId === LA_TRIP_ID)
    return res.status(400).json({ error: 'The LA trip uses the full pipeline (/api/admin/run-pipeline).' });
  if (!(await apifyGuard('a trip search')))
    return res.status(429).json({ error: 'Rental search is paused — Apify usage is near its monthly limit. The site manager has been alerted to rotate the key.' });
  const max = Math.min(20, Math.max(1, Number(req.body && req.body.max) || 10));
  if (!spawnTripSearch(req.params.tripId, max, true))
    return res.status(400).json({ error: 'Search could not start — this trip is decided or has already happened.' });
  res.json({ ok: true });
});

// Manual "refresh listings" — listings auto-refresh every PIPELINE_INTERVAL_DAYS;
// the organizer gets ONE free manual refresh per that window.
app.post('/api/trips/:tripId/refresh', requireTripOwner, async (req, res) => {
  const tripId = req.params.tripId;
  const now = Date.now();
  const windowMs = PIPELINE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
  const last = req.trip.last_manual_refresh ? Date.parse(req.trip.last_manual_refresh) : 0;
  if (last && now - last < windowMs) {
    const days = Math.ceil((last + windowMs - now) / (24 * 60 * 60 * 1000));
    return res.status(429).json({
      error: `You've used your manual refresh. Listings auto-refresh every ${PIPELINE_INTERVAL_DAYS} days — next manual refresh in ${days} day${days === 1 ? '' : 's'}.`,
      nextRefreshAt: new Date(last + windowMs).toISOString(),
    });
  }
  // Decided or past → the trip is done; refreshing would just burn spend.
  if (isTripSettled(req.trip))
    return res.status(400).json({ error: 'This trip has an official pick — listings no longer refresh. Unlock the pick to search again.' });
  if (isTripPast(req.trip))
    return res.status(400).json({ error: 'This trip has already happened — it lives in Previous trips now.' });
  if (!(await apifyGuard('a manual refresh')))
    return res.status(429).json({ error: 'Rental search is paused — Apify usage is near its monthly limit.' });
  if (tripId === LA_TRIP_ID) {
    runPipelineJob().catch((e) => console.error('[refresh] pipeline error:', e && e.message));
  } else if (!spawnTripSearch(tripId, 10, true)) {
    return res.status(400).json({ error: 'Search could not start for this trip.' });
  }
  const trips = loadTrips();
  if (trips[tripId]) { trips[tripId].last_manual_refresh = new Date(now).toISOString(); saveTrips(trips); }
  res.json({ ok: true });
});

// Admin: trigger an immediate LA listings refresh (self-host Airbnb + Apify VRBO).
// Bypasses the organizer once-per-window limit and does NOT email members (it's a
// verification/ops trigger). Auth via x-admin-key header or a signed-in super-admin.
app.post('/api/admin/refresh-la', requireAdmin, async (req, res) => {
  const { spawn } = require('child_process');
  // Run the guard first so a maxed-out primary Apify key rotates to a stacked
  // backup with headroom before we spawn (otherwise the child inherits the dead
  // key and VRBO comes back empty).
  await apifyGuard('a manual LA refresh').catch(() => {});
  // ?fast=1 → skip Playwright re-pricing (use discovery prices) so the board
  // updates in ~2min. Inherit stdio so stage logs reach `railway logs`.
  const env = { ...process.env, APIFY_TOKEN: getApifyToken() };
  if (req.query.fast === '1') env.SKIP_PRICE_FETCH = '1';
  const child = spawn('node', ['pipeline.js'], {
    cwd: __dirname, env, stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code) => console.log(`[admin] LA refresh pipeline exited code ${code}`));
  console.log('[admin] manual LA refresh triggered');
  res.json({ ok: true, started: true });
});

// Admin: one-off — flag all homes currently on the board as freshly pulled, so the
// gold "New" badge is visible (used for the Apify→self-host cutover, where the first
// self-host run re-pulls the whole board). Normal refreshes recompute is_new
// automatically (only genuinely-new inserts get it). Auth via x-admin-key.
app.post('/api/admin/flag-fresh', requireAdmin, (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(PIPELINE_DB);
    try { db.exec('ALTER TABLE listings ADD COLUMN is_new INTEGER DEFAULT 0'); } catch { /* exists */ }
    const r = db.prepare('UPDATE listings SET is_new = 1 WHERE passed_filter = 1').run();
    const n = db.prepare('SELECT COUNT(*) n FROM listings WHERE is_new = 1 AND passed_filter = 1').get().n;
    db.close();
    res.json({ ok: true, flagged: r.changes, newOnBoard: n });
  } catch (e) { res.status(500).json({ error: String(e && e.message) }); }
});

// Search progress for the board (open — anyone viewing can see "finding rentals").
app.get('/api/trips/:tripId/search-status', loadTripOr404, (req, res) => {
  const marker = path.join(tripDir(req.params.tripId), '.searching');
  let searching = false;
  try {
    const st = fs.statSync(marker);
    searching = (Date.now() - st.mtimeMs) < 6 * 60 * 1000; // stale >6min ⇒ treat as finished
  } catch { searching = false; }
  const count = (loadListings(req.params.tripId).listings || []).length;
  res.json({ searching, count, configured: !!process.env.APIFY_TOKEN });
});

// Delete a trip (organizer only). Removes the registry entry + all per-trip data.
app.delete('/api/trips/:tripId', requireTripCreator, (req, res) => {
  const id = req.params.tripId;
  if (id === LA_TRIP_ID) return res.status(400).json({ error: 'The default trip cannot be deleted.' });
  const trips = loadTrips();
  delete trips[id];
  saveTrips(trips);
  try { fs.rmSync(path.join(DATA_DIR, 'trips', id), { recursive: true, force: true }); } catch {}
  res.json({ ok: true });
});

// Per-trip group pulse for the organizer (engagement only, no per-user detail).
app.get('/api/trips/:tripId/pulse', requireTripOwner, (req, res) => {
  const tripId = req.params.tripId;
  const votesObj = loadVotes(tripId);
  const votes = Object.values(votesObj).reduce((n, m) => n + Object.keys(m || {}).length, 0);
  res.json({
    members: (req.trip.members || []).length,
    votes,
    picks: Object.keys(loadFinalVotes(tripId)).length,
    submissions: loadSubmitted(tripId).length,
    decisionLocked: !!loadDecision(tripId),
    listings: (loadListings(tripId).listings || []).length,
  });
});

// ── Pipeline scheduler ────────────────────────────────────────────────────────
// Runs pipeline.js every PIPELINE_INTERVAL_DAYS days at PIPELINE_HOUR_UTC.
// Default is WEEKLY (not daily): each run bills Apify, and the free tier is only
// $5/account/month — daily runs would blow that. Prices for an Aug trip barely
// move week-to-week this far out, so weekly is plenty. Self-rescheduling
// setTimeout so it survives indefinitely while the server is up.
const PIPELINE_HOUR_UTC     = Number(process.env.PIPELINE_HOUR_UTC ?? 15);
const PIPELINE_INTERVAL_DAYS = Math.max(1, Number(process.env.PIPELINE_INTERVAL_DAYS ?? 3));

async function runPipelineJob() {
  // Decided or finished → nothing left to shop for. Skip the scrape entirely.
  const laTrip = getTrip(LA_TRIP_ID);
  if (laTrip && isTripDormant(laTrip)) {
    console.log(`[Cron] Skipping pipeline run — trip is ${isTripSettled(laTrip) ? 'decided' : 'past'}`);
    return;
  }
  if (!apifyConfigured()) {
    console.log('[Cron] Skipping pipeline run — no Apify key configured');
    return;
  }
  if (!(await apifyGuard('the scheduled LA refresh'))) return;
  const { spawn } = require('child_process');
  console.log('[Cron] Starting scheduled pipeline run…');
  const child = spawn('node', ['pipeline.js'], {
    cwd: __dirname, env: { ...process.env, APIFY_TOKEN: getApifyToken() }, detached: true, stdio: 'ignore',
  });
  child.on('exit', (code) => { if (code === 0) notifyFreshHomes(LA_TRIP_ID); }); // email members: fresh homes
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

// ── Daily member digest ─────────────────────────────────────────────────────────
// Once a day, email each trip's members a recap of the last day's activity. Trips
// with nothing new are skipped (no spam). Respects per-user prefs + unsubscribe.
const DIGEST_HOUR_UTC = Number(process.env.DIGEST_HOUR_UTC ?? 16);
const DIGEST_LABELS = { submit: 'new home', caveat: 'must-have', pick: 'top-choice pick', vote: 'vote', decision: 'decision' };

function buildDigest(tripId, sinceTs) {
  const events = loadEvents(tripId).filter(e => e.ts > sinceTs);
  if (!events.length) return null;
  const groups = {};
  for (const e of events) (groups[e.type] = groups[e.type] || []).push(e);
  return { total: events.length, groups };
}
function digestHtml(trip, digest, recip) {
  let rows = '';
  for (const type of ['submit', 'caveat', 'pick', 'vote', 'decision']) {
    const list = digest.groups[type];
    if (!list || !list.length) continue;
    const head = `${list.length} ${DIGEST_LABELS[type]}${list.length === 1 ? '' : 's'}`;
    const samples = (type === 'submit' || type === 'caveat') ? list.slice(-4).map((e) => e.text) : [];
    rows += Emails.digestRow(head, samples);
  }
  return Emails.digest({
    appBase: APP_BASE_URL, tripName: trip.name, boardUrl: boardUrl(trip.id), rowsHtml: rows, unsub: recip.unsub,
  });
}
async function runDigestJob() {
  const trips = loadTrips();
  const now = Date.now();
  for (const trip of Object.values(trips)) {
    try {
      // Decided or past trips are done — stop the daily recap. The decision email
      // is the last thing a member hears about this trip.
      if (isTripDormant(trip)) continue;
      const since = trip.last_digest_at ? Date.parse(trip.last_digest_at) : (now - 24 * 3600 * 1000);
      const digest = buildDigest(trip.id, since);
      if (digest) {
        const recips = tripRecipients(trip).filter(r => r.prefs.digest);
        for (const r of recips) await sendEmail(r.email, `${trip.name}: your daily recap`, digestHtml(trip, digest, r));
        if (recips.length) console.log(`[digest] ${trip.id}: sent ${recips.length} (${digest.total} events)`);
      }
    } catch (e) { console.error('[digest] trip failed:', trip.id, e.message); }
  }
  // Advance the window for every trip (re-read in case membership changed mid-run).
  const fresh = loadTrips();
  for (const id of Object.keys(fresh)) fresh[id].last_digest_at = new Date(now).toISOString();
  saveTrips(fresh);
}
function scheduleDigest() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(DIGEST_HOUR_UTC, 0, 0, 0);
  while (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const delay = next - now;
  console.log(`[digest] Next member digest at ${next.toISOString()} (in ${Math.round(delay / 3600000)}h)`);
  setTimeout(() => {
    runDigestJob().catch(e => console.error('[digest] job failed:', e.message));
    scheduleDigest();
  }, delay);
}

// ── Crash safety ─────────────────────────────────────────────────────────────
// One unhandled error must not take the whole single-process server down for
// everyone. Express error middleware catches sync/async route throws and keeps
// the process alive.
app.use((err, req, res, _next) => {
  console.error('[express] unhandled route error:', (err && err.stack) || err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our end. Try again.' });
});
process.on('unhandledRejection', (reason) => { console.error('[unhandledRejection]', reason); });
// An uncaughtException leaves Node in an undefined state (half-open handles,
// partially-mutated memory) — continuing to serve requests and WRITE FILES from
// there risks corrupt data. Log, then exit non-zero so Railway's ON_FAILURE
// policy restarts a clean process. The short delay lets the log flush first.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] exiting for a clean restart:', (err && err.stack) || err);
  setTimeout(() => process.exit(1), 100).unref();
});

// Public, unauthenticated health check for uptime monitors / Railway.
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`GroupPad listening on :${PORT}`);
  try { migrateLegacyTripIfNeeded(); } catch (e) { console.error('[migrate] failed:', e.message); }
  try { migrateExperienceIds(); } catch (e) { console.error('[migrate] exp ids failed:', e.message); }
  try { ensureLaOwner(); } catch (e) { console.error('[repair] failed:', e.message); }
  // Reconcile likes/picks left behind by members removed before purge existed.
  try { for (const id of Object.keys(loadTrips())) purgeNonMemberActivity(id); } catch (e) { console.error('[purge] failed:', e.message); }
  // Backfill 3-distance chips on pre-existing community submissions (one-time).
  backfillSubmissionDistances().catch((e) => console.error('[backfill-sub] failed:', e.message));
  schedulePipeline();
  scheduleDigest();
  scheduleTours();
});
