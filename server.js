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
const USERS_FILE     = path.join(DATA_DIR, 'users.json');            // persisted (accounts)
const SESSIONS_FILE  = path.join(DATA_DIR, 'sessions.json');         // persisted (login sessions)
const MAGIC_FILE     = path.join(DATA_DIR, 'magic.json');            // persisted (pending magic links)
const FINALVOTES_FILE = path.join(DATA_DIR, 'finalvotes.json');      // persisted (each member's single top pick)
const DECISION_FILE   = path.join(DATA_DIR, 'decision.json');        // persisted (admin-locked final pick)
const USAGE_FILE      = path.join(DATA_DIR, 'usage.json');           // persisted (app-side API meter, by month)

app.use(express.json());
app.use((req, res, next) => attachUser(req, res, next));
// Serve the compiled React client (Vite build) first; fall back to the legacy
// static `public/` assets for anything not produced by the build. The client
// uses HashRouter, so the server only ever needs to serve `/` → index.html.
app.use(express.static(path.join(__dirname, 'client', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

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

// Final pick: each member's single top choice, plus the organizer-locked decision.
function loadFinalVotes(tripId)    { return readJson(tripFile(tripId, 'finalvotes.json'), {}); }
function saveFinalVotes(v, tripId) { writeJsonAtomic(tripFile(tripId, 'finalvotes.json'), v); }
function loadDecision(tripId)    { return readJson(tripFile(tripId, 'decision.json'), null); }
function saveDecision(d, tripId) { writeJsonAtomic(tripFile(tripId, 'decision.json'), d); }

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
  const id = `${slugify(f.name || f.destination)}-${crypto.randomBytes(4).toString('hex')}`;
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
function isOwner(trip, user)  { return !!user && !!trip && trip.owner_id === user.id; }
function isMember(trip, user) { return !!user && !!trip && Array.isArray(trip.members) && trip.members.includes(user.id); }
// A member-safe public view of a trip for a given caller (never leaks join_code
// unless the caller is the owner).
function tripView(trip, user) {
  if (!trip) return null;
  const { join_code, members, owner_id, ...rest } = trip;
  const owner = isOwner(trip, user);
  return {
    ...rest,
    isOwner: owner,
    isMember: isMember(trip, user),
    memberCount: Array.isArray(members) ? members.length : 0,
    // Only the organizer sees the invite code, the member list, and owner id.
    ...(owner ? { join_code, members, owner_id } : {}),
  };
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
  if (trip.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the trip organizer can do that.' });
  req.trip = trip;
  next();
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
    console.log(`[auth] (email not configured) magic link for ${email}: ${link}`);
    return { sent: false };
  }
  const from = process.env.MAIL_FROM || 'GroupPad <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [email], subject: 'Your GroupPad sign-in link',
      html: `<p>Tap to sign in to GroupPad:</p>
             <p><a href="${link}">Sign in</a></p>
             <p style="color:#888;font-size:12px">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
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

// Apify spend guard: returns true if it's OK to spend, false if we're near the
// monthly cap — in which case the site manager is emailed (throttled to 12h) so
// they can rotate APIFY_TOKEN. Unknown limit / errors → allow (never hard-block).
let _lastApifyAlertAt = 0;
const APIFY_ALERT_PCT = Number(process.env.APIFY_ALERT_PCT || 0.85);
async function apifyGuard(context) {
  try {
    const s = await fetchApifySummary();
    if (!s || s.usageUsd == null || s.limitUsd == null || s.limitUsd <= 0) return true;
    const pct = s.usageUsd / s.limitUsd;
    if (pct < APIFY_ALERT_PCT) return true;
    const now = Date.now();
    if (now - _lastApifyAlertAt > 12 * 60 * 60 * 1000) {
      _lastApifyAlertAt = now;
      await sendManagerEmail(
        `⚠️ GroupPad: Apify usage at ${Math.round(pct * 100)}%`,
        `<p>The Apify account is at <b>${Math.round(pct * 100)}%</b> of its monthly limit ($${s.usageUsd.toFixed(2)} of $${s.limitUsd.toFixed(2)}).</p>
         <p>GroupPad <b>paused ${context}</b> to avoid overage. Rotate <code>APIFY_TOKEN</code> on Railway (or upgrade the plan) to resume rental searches.</p>`
      );
      console.warn(`[apify-guard] near limit (${Math.round(pct * 100)}%) — paused ${context}, manager alerted`);
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

// ── Auth: passwordless magic-link ───────────────────────────────────────────────
// Who am I? (null when signed out) — the client bootstraps from this.
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.name } : null });
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
  const link = `${req.protocol}://${req.get('host')}/api/auth/verify?token=${token}`;
  try { await sendMagicLink(email, link); }
  catch { return res.status(502).json({ error: 'Could not send the email. Try again shortly.' }); }
  res.json({ ok: true });
});

// Click target from the email: consume the token, start a session, land home.
app.get('/api/auth/verify', (req, res) => {
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
  const name = String((req.body && req.body.name) || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Name cannot be empty.' });
  const users = loadUsers();
  if (users[req.user.id]) { users[req.user.id].name = name; saveUsers(users); }
  res.json({ user: { id: req.user.id, email: req.user.email, name } });
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
// The redirect URI must match exactly what's registered in Google Cloud. We build
// it from the request (trust-proxy makes this https on Railway) but allow an env
// override for safety.
function googleRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
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
  const { listing_id, vote } = req.body || {};
  if (!listing_id || !['up', 'down', null].includes(vote))
    return res.status(400).json({ error: 'expected { listing_id, vote: "up"|"down"|null }' });
  const voter = req.user.id;
  const votes = loadVotes(tripId);
  if (!votes[listing_id]) votes[listing_id] = {};
  if (vote === null) delete votes[listing_id][voter];
  else votes[listing_id][voter] = vote;
  saveVotes(votes, tripId);
  if (tripId) addMember(tripId, voter); // auto-join on first participation
  res.json(votes);
};
app.post('/api/votes', requireAuth, hPostVotes);
app.post('/api/trips/:tripId/votes', requireAuth, loadTripOr404, hPostVotes);

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

// Submit a new listing
const hSubmit = async (req, res) => {
  const tripId = req.params.tripId;
  const { url, manual_price } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const parsed = parseListingUrl(url);
  if (!parsed)
    return res.status(400).json({ error: 'Please enter a valid http/https URL' });

  // Guard against SSRF before we fetch the URL server-side.
  try { await assertSafeUrl(url); }
  catch (e) { return res.status(400).json({ error: e.message || 'URL not allowed' }); }

  // Dedup check against submitted
  if (loadSubmitted(tripId).find(s => s.id === parsed.id && s.source === parsed.source))
    return res.status(409).json({ error: 'Already submitted' });

  // Dedup check against main listings
  const main = loadListings(tripId);
  if (main.listings.find(l => String(l.id) === String(parsed.id) && l.source === parsed.source))
    return res.status(409).json({ error: 'Already in the main list' });

  const cleanUrl = url.split('?')[0];
  const scraped  = await scrapeListingDetails(cleanUrl, parsed);
  const by       = (req.user.name || 'member').slice(0, 60);

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
    distances:     refDistances(scraped.lat, scraped.lng, tripRefPoints(tripId)),
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

  // Re-read after the async scrape so two concurrent submits can't clobber
  // each other (the scrape is the only await between read and write).
  const fresh = loadSubmitted(tripId);
  fresh.push(entry);
  saveSubmitted(fresh, tripId);
  if (tripId) addMember(tripId, req.user.id); // auto-join on first contribution
  res.json(entry);
};
app.post('/api/submit', requireAuth, rateLimit({ windowMs: 60000, max: 5 }), hSubmit);
app.post('/api/trips/:tripId/submit', requireAuth, loadTripOr404, rateLimit({ windowMs: 60000, max: 5 }), hSubmit);

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
    // The `distances` column is added by the pipeline on its next run; older DBs
    // don't have it yet, so select it conditionally to avoid "no such column".
    const hasDistances = db.prepare('PRAGMA table_info(listings)').all().some(c => c.name === 'distances');
    const rows = db.prepare(`
      SELECT
        l.source, l.listing_id, l.name, l.url, l.location,
        l.bedrooms, l.bathrooms, l.sleeps,
        l.amenities, l.photos,
        l.has_pool, l.has_parking,
        l.rating, l.reviews, l.distance_mi, ${hasDistances ? 'l.distances' : "'[]' AS distances"},
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
const hCompare = async (req, res) => {
  const tripId = req.params.tripId;
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI compare is not configured (GEMINI_API_KEY missing).' });
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
  const caveats = loadCaveats(tripId).slice(-30).map(c => `- ${c.name}: ${c.text}`).join('\n');

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

  const prompt = headToHead
    ? `${context}
Head-to-head: compare these TWO homes (JSON):
${JSON.stringify(compact, null, 1)}

${itineraryRule}

Write a punchy 1v1 markdown breakdown:
1. **Winner:** name the better pick in one bold line and why${hasItinerary ? ', referencing their itinerary' : ''}.
2. A tight table (Metric | Home 1 | Home 2) covering beds/sleeps, ~all-in price, distance from DTLA, pool, hot tub, parking, rating/reviews.
3. "Pick Home 1 if…" / "Pick Home 2 if…" — one line each, tied to their plans.
Keep it under ~250 words. Refer to homes by number and name.`
    : `${context}
Here are the candidate listings (JSON):
${JSON.stringify(compact, null, 1)}

${itineraryRule}

Write a concise, friendly comparison in markdown:
1. A short ranked recommendation (best fit first) with one-line reasons explicitly tied to their itinerary and group size.
2. A compact comparison table (Listing # | beds/sleeps | ~all-in | distance | pool/hot tub | standout).
3. Call out any red flags (too far for their planned activities, tight sleeping capacity for ${adults}, over budget, low/no reviews).
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
    // Meter token spend (Gemini has no per-key billing API, so we track it here).
    const um = data.usageMetadata || {};
    bumpUsage('gemini', {
      calls: 1,
      promptTokens: um.promptTokenCount || 0,
      candidatesTokens: um.candidatesTokenCount || 0,
      totalTokens: um.totalTokenCount || ((um.promptTokenCount || 0) + (um.candidatesTokenCount || 0)),
    });
    const analysis = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!analysis) return res.status(502).json({ error: 'Gemini returned no text.' });
    // Cache the full-shortlist analysis so everyone sees it without re-spending
    // on Gemini. 1v1 battles are ad-hoc and not cached.
    if (!headToHead) {
      // Record which listings were analyzed so the client can flag the insights
      // as stale once the shortlist changes.
      const ids = listings.map(l => String(l.id)).sort();
      saveInsights({ analysis, count: compact.length, ids, created_at: new Date().toISOString() }, tripId);
    }
    res.json({ analysis });
  } catch (e) {
    console.error('[compare]', e.message);
    res.status(500).json({ error: e.message });
  }
};
app.post('/api/compare-listings', rateLimit({ windowMs: 60000, max: 10 }), hCompare);
app.post('/api/trips/:tripId/compare-listings', loadTripOr404, rateLimit({ windowMs: 60000, max: 10 }), hCompare);

// Admin: trigger a pipeline run (runs pipeline.js as a child process)
app.post('/api/admin/run-pipeline', requireAdmin, async (req, res) => {
  if (!process.env.APIFY_TOKEN) return res.status(400).json({ error: 'APIFY_TOKEN not set on server' });
  if (!(await apifyGuard('the manual pipeline run')))
    return res.status(429).json({ error: 'Apify usage is near its monthly limit — paused. Rotate APIFY_TOKEN to resume.' });
  const { spawn } = require('child_process');
  console.log('[Admin] Starting pipeline run…');
  const child = spawn('node', ['pipeline.js'], { cwd: __dirname, env: { ...process.env }, detached: true, stdio: 'ignore' });
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
  list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), user_id: req.user.id, name, text, created_at: new Date().toISOString() });
  const trimmed = list.slice(-200); // keep the log bounded
  saveCaveats(trimmed, tripId);
  if (tripId) addMember(tripId, req.user.id);
  res.json(trimmed);
};
app.post('/api/caveats', requireAuth, hPostCaveat);
app.post('/api/trips/:tripId/caveats', requireAuth, loadTripOr404, hPostCaveat);

const hDeleteCaveat = (req, res) => {
  const tripId = req.params.tripId;
  const updated = loadCaveats(tripId).filter(c => c.id !== req.params.id);
  saveCaveats(updated, tripId);
  res.json(updated);
};
app.delete('/api/caveats/:id', requireAdmin, hDeleteCaveat);
app.delete('/api/trips/:tripId/caveats/:id', requireTripOwner, hDeleteCaveat);

// ── Final pick: member "top choice" poll + organizer-locked decision ────────────
// Aggregate counts only — never expose who voted for which listing.
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
  res.json({ counts, total, myPick, decision: loadDecision(tripId) });
};
app.get('/api/final', hGetFinal);
app.get('/api/trips/:tripId/final', loadTripOr404, hGetFinal);

const hFinalVote = (req, res) => {
  const tripId = req.params.tripId;
  const raw = req.body && req.body.listing_id;
  const votes = loadFinalVotes(tripId);
  if (raw === null || raw === undefined || raw === '') {
    delete votes[req.user.id]; // allow clearing your top choice
  } else {
    votes[req.user.id] = String(raw).slice(0, 80);
  }
  saveFinalVotes(votes, tripId);
  if (tripId) addMember(tripId, req.user.id);
  const { counts, total } = tallyFinal(votes);
  res.json({ counts, total, myPick: votes[req.user.id] || null, decision: loadDecision(tripId) });
};
app.post('/api/final-vote', requireAuth, hFinalVote);
app.post('/api/trips/:tripId/final-vote', requireAuth, loadTripOr404, hFinalVote);

const hDecision = (req, res) => {
  const tripId = req.params.tripId;
  const raw = req.body && req.body.listing_id;
  if (raw === null || raw === undefined || raw === '') {
    saveDecision(null, tripId); // unlock
    return res.json({ decision: null });
  }
  const decision = { listing_id: String(raw).slice(0, 80), locked_at: new Date().toISOString() };
  saveDecision(decision, tripId);
  res.json({ decision });
};
app.post('/api/admin/decision', requireAdmin, hDecision);
app.post('/api/trips/:tripId/decision', requireTripOwner, hDecision);

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

async function fetchApifySummary() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  try {
    const [limitsR, runsR] = await Promise.all([
      fetch(`https://api.apify.com/v2/users/me/limits?token=${token}`),
      fetch(`https://api.apify.com/v2/actor-runs?token=${token}&limit=8&desc=1`),
    ]);
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
      configured: !!process.env.APIFY_TOKEN,
      spentUsd: apify ? apify.usageUsd : null,
      limitUsd: apify ? apify.limitUsd : null,
      recent: apify ? apify.recent : [],
    },
    group: {
      members: Object.keys(loadUsers()).length,
      votes,
      picks: Object.keys(loadFinalVotes()).length,
      submissions: loadSubmitted().length,
      decisionLocked: !!loadDecision(),
      refreshedAt: trip ? trip.refreshed_at : null,
    },
  });
});

// Spawn the trip-scoped rental search (pipeline.js in TRIP_ID mode) for a newly
// created trip. Writes a .searching marker immediately so the client's status
// poll is accurate from t=0; pipeline.js clears it when the run finishes.
function spawnTripSearch(tripId, maxItems) {
  if (!process.env.APIFY_TOKEN || tripId === LA_TRIP_ID) return false;
  try { fs.writeFileSync(path.join(tripDir(tripId), '.searching'), new Date().toISOString()); } catch {}
  const { spawn } = require('child_process');
  const env = { ...process.env, TRIP_ID: tripId };
  if (maxItems) env.TRIP_SEARCH_MAX = String(maxItems);
  const child = spawn('node', ['pipeline.js'], { cwd: __dirname, env, detached: true, stdio: 'ignore' });
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
    .map(t => tripView(t, req.user));
  res.json({ trips: mine });
});

// Create a new trip; the caller becomes the organizer.
app.post('/api/trips', requireAuth, (req, res) => {
  const { name, destination, checkin, checkout_5n, adults, budget, bedrooms, home_type, itinerary } =
    req.body || {};
  if (!destination || !String(destination).trim())
    return res.status(400).json({ error: 'Destination is required.' });
  if (!checkin || !checkout_5n)
    return res.status(400).json({ error: 'Check-in and check-out dates are required.' });
  const trip = createTrip(req.user, { name, destination, checkin, checkout_5n, adults, budget, bedrooms, home_type });
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
  if (trip.join_code && code && code !== trip.join_code)
    return res.status(403).json({ error: 'Invalid invite link.' });
  const updated = addMember(trip.id, req.user.id);
  res.json(tripView(updated, req.user));
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
  res.json({ ok: true });
});

// Organizer: (re)run the rental search for this trip (capped).
app.post('/api/trips/:tripId/run-search', requireTripOwner, async (req, res) => {
  if (req.params.tripId === LA_TRIP_ID)
    return res.status(400).json({ error: 'The LA trip uses the full pipeline (/api/admin/run-pipeline).' });
  if (!(await apifyGuard('a trip search')))
    return res.status(429).json({ error: 'Rental search is paused — Apify usage is near its monthly limit. The site manager has been alerted to rotate the key.' });
  const max = Math.min(20, Math.max(1, Number(req.body && req.body.max) || 10));
  if (!spawnTripSearch(req.params.tripId, max))
    return res.status(400).json({ error: 'Search is not configured (APIFY_TOKEN missing on server).' });
  res.json({ ok: true });
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
app.delete('/api/trips/:tripId', requireTripOwner, (req, res) => {
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
  if (!process.env.APIFY_TOKEN) {
    console.log('[Cron] Skipping pipeline run — APIFY_TOKEN not set');
    return;
  }
  if (!(await apifyGuard('the scheduled LA refresh'))) return;
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
  try { migrateLegacyTripIfNeeded(); } catch (e) { console.error('[migrate] failed:', e.message); }
  try { ensureLaOwner(); } catch (e) { console.error('[repair] failed:', e.message); }
  schedulePipeline();
});
