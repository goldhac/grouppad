// Experiences runner — spawned by the server as a detached child (mirrors how
// pipeline.js runs the homes trip-search). Reads the trip record from the
// registry, scrapes Airbnb Experiences for the trip's destination + dates via
// the free self-hosted scraper, and writes the normalized rows to the trip's
// experiences.json. Config comes via env: TRIP_ID (required), PIPELINE_DATA_DIR,
// EXP_MAX (optional cap, default 40).
const fs = require('fs');
const path = require('path');
const { searchExperiences, enrichExperiencesWithCoords } = require('../experiences');
const { searchOsmAttractions } = require('../osm');
const { searchViatorExperiences } = require('../viator');

const DATA_DIR = process.env.PIPELINE_DATA_DIR || path.join(__dirname, '..', 'data');
const TRIP_ID = process.env.TRIP_ID || '';
const EXP_MAX = Number(process.env.EXP_MAX || 40);

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

async function main() {
  // Same trip-id shape guard as the server's tripDir (defense-in-depth: the id
  // becomes a filesystem path segment).
  if (!TRIP_ID || !/^[a-z0-9-]+$/.test(TRIP_ID)) {
    console.error('[experiences] TRIP_ID missing or invalid'); process.exit(1);
  }
  const trips = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'trips.json'), 'utf8'));
  const trip = trips[TRIP_ID];
  if (!trip) { console.error(`[experiences] trip ${TRIP_ID} not found`); process.exit(1); }

  // The server passes the exact output path (EXP_OUT) because storage layout
  // differs by trip: the legacy LA trip lives flat in DATA_DIR, newer trips
  // under trips/<id>/. Fall back to the modern layout for standalone runs.
  const outFile = process.env.EXP_OUT || path.join(DATA_DIR, 'trips', TRIP_ID, 'experiences.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const marker = path.join(path.dirname(outFile), '.exp-searching');
  fs.writeFileSync(marker, new Date().toISOString());

  try {
    let rows = await searchExperiences({
      location: trip.destination || trip.name,
      checkin: trip.checkin || null,
      checkout: trip.checkout_5n || trip.checkout || null,
      adults: Number(trip.adults) || 2,
      maxItems: EXP_MAX,
    });

    // Fill lat/lng from each experience's detail page (plain HTTPS, ~1s each,
    // cached in-module). Failures leave null — distance features just skip those.
    if (rows && rows.length) {
      try { await enrichExperiencesWithCoords(rows, { concurrency: 3, maxLookups: EXP_MAX }); }
      catch (e) { console.warn('[experiences] coords enrichment failed (non-fatal):', e.message); }
    }

    // ── Source 2: free things to do from OpenStreetMap ──────────────────────
    // Centre the search on the MEDIAN of the Airbnb coords we just enriched —
    // no geocoder needed, and it lands on wherever the activity actually is
    // rather than a city centroid. Purely additive: if OSM is down we still
    // write the Airbnb rows.
    let osmRows = [];
    const located = (rows || []).filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number');
    if (located.length >= 3) {
      const mid = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
      const lat = mid(located.map((r) => r.lat));
      const lng = mid(located.map((r) => r.lng));
      try {
        osmRows = await searchOsmAttractions({ lat, lng, radiusM: Number(process.env.OSM_RADIUS_M || 12000), limit: Number(process.env.OSM_MAX || 40) });
      } catch (e) { console.warn('[experiences] OSM lookup failed (non-fatal):', e.message); }
    } else {
      console.warn('[experiences] too few located rows to centre an OSM search — skipping');
    }

    // ── Source 3: bookable tours & activities from the Viator Partner API ────
    // Keyed off the trip's destination NAME (Viator searches by its own
    // destination ids, not coordinates), so this works even when coord
    // enrichment failed entirely. Inert without VIATOR_API_KEY.
    let viatorRows = [];
    try {
      viatorRows = await searchViatorExperiences({
        destination: trip.destination || trip.name,
        checkin: trip.checkin || null,
        checkout: trip.checkout_5n || trip.checkout || null,
        limit: Number(process.env.VIATOR_MAX || 30),
      });
    } catch (e) { console.warn('[experiences] Viator lookup failed (non-fatal):', e.message); }

    // Same lesson as the homes pipeline (GP-A4): a blocked/empty scrape must not
    // blow away a good list — keep what the group is already voting on.
    let prev = [];
    try { prev = JSON.parse(fs.readFileSync(outFile, 'utf8')) || []; } catch {}
    const hadPrev = prev.length > 0;
    const otherCount = osmRows.length + viatorRows.length;
    if ((!rows || rows.length === 0) && !otherCount && hadPrev) {
      console.warn(`[experiences] 0 results from every source but a previous list exists — keeping existing → ${outFile}`);
      return;
    }
    // Airbnb died but another source answered: keep the previous Airbnb rows
    // rather than letting a partial run replace the board with parks only.
    if ((!rows || rows.length === 0) && otherCount && hadPrev) {
      const keptAirbnb = prev.filter((r) => (r.source || 'airbnb') === 'airbnb');
      console.warn(`[experiences] Airbnb returned 0 — keeping ${keptAirbnb.length} previous Airbnb row(s) alongside ${osmRows.length} OSM + ${viatorRows.length} Viator`);
      rows = keptAirbnb;
    }

    // Airbnb returns a different slice of results each run, so an experience the
    // group already ENGAGED with (voted, saved, or pinned to a day) can silently
    // vanish from the board while its votes linger invisibly in the store. Carry
    // those rows forward, flagged, so the leaderboard and plans stay coherent.
    const dir = path.dirname(outFile);
    const readMap = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) || {}; } catch { return {}; } };
    const votes = readMap('exp-votes.json');
    const days = readMap('exp-days.json');
    const saves = readMap('exp-saves.json');
    const engaged = new Set([
      ...Object.keys(votes).filter((id) => Object.keys(votes[id] || {}).length > 0),
      ...Object.keys(days),
      ...Object.values(saves).flat().map(String),
    ]);
    const fresh = new Set([...(rows || []), ...osmRows, ...viatorRows].map((x) => String(x.id)));
    const carried = prev.filter((x) => engaged.has(String(x.id)) && !fresh.has(String(x.id)))
                        .map((x) => ({ ...x, retained: true }));
    const final = [...(rows || []), ...osmRows, ...viatorRows, ...carried];
    if (carried.length) console.log(`[experiences] carried ${carried.length} engaged row(s) the refresh dropped`);

    writeJsonAtomic(outFile, final);
    const bySource = final.reduce((a, r) => { const s = r.source || 'airbnb'; a[s] = (a[s] || 0) + 1; return a; }, {});
    console.log(`[experiences] wrote ${final.length} experiences → ${outFile} ${JSON.stringify(bySource)}`);
  } finally {
    try { fs.unlinkSync(marker); } catch {}
  }
}

main().catch((e) => { console.error('[experiences] failed:', (e && e.stack) || e); process.exit(1); });
