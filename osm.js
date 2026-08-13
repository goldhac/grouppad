// ─────────────────────────────────────────────────────────────────────────────
// osm.js — FREE things to do from OpenStreetMap (Overpass API).
//
// The complement to the Airbnb scraper: parks, beaches, viewpoints, museums,
// landmarks — the stuff a group actually does that no marketplace sells, and
// that is usually free. Open data (ODbL), no key, no anti-bot wall.
//
// Measured from the Railway production container (2026-08-11), not assumed:
//   • a browser-like User-Agent → 406; Overpass wants a descriptive app UA
//   • QUERY COST dominates mirror choice. A 25km bbox with 7 node/way clauses
//     504s on kumi + private.coffee, and overpass-api.de answers 200 with ZERO
//     elements (it times out server-side and still returns success).
//   • The lean 12km / 3-clause form below → 200 with 50 elements in ~15s.
//   • Mirrors swap places hour to hour, so we try all three and treat
//     "200 but empty" as a failure worth retrying elsewhere.
// ~15s latency means this belongs in the background runner, never a request path.
//
// Rows come back in the SAME normalized shape as experiences.js, with
// namespaced ids (`osm:node/123`) so votes/saves/day-pins can never collide
// with another provider's numeric ids.
// ─────────────────────────────────────────────────────────────────────────────

// Order from measured behaviour in the Railway container, not reputation:
// the lean query below returned 200/50 elements in ~15s on overpass-api.de while
// kumi timed out at 40s. Every mirror is flaky at some hour, so we try them all.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const MIRROR_TIMEOUT_MS = 40000;   // Overpass is genuinely slow; 20s is too tight
const UA = 'GroupPad/1.0 (group trip planner; +https://grouppad.goldhac.com)';

// What counts as "a thing to do", kept deliberately LEAN. Measured from Railway:
// a 25km bbox with 7 separate node/way clauses 504s on every mirror (and returns
// 0 elements even when a mirror answers 200 — it times out server-side). This
// 12km / 3-clause `nwr` form answered 200 with 50 elements in ~15s. Requiring
// ["name"] on the broad categories both cuts cost and drops unnamed noise.
const FILTERS = [
  'nwr["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|aquarium)$"]',
  'nwr["leisure"~"^(park|nature_reserve)$"]["name"]',
  'nwr["natural"="beach"]["name"]',
];

// OSM tags → the same vibe vocabulary the UI already filters on.
function osmCategory(tags = {}) {
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'Museums & galleries';
  if (tags.tourism === 'viewpoint') return 'Viewpoints';
  if (tags.tourism === 'artwork') return 'Art';
  if (tags.tourism === 'zoo' || tags.tourism === 'aquarium') return 'Zoos & aquariums';
  if (tags.tourism === 'theme_park') return 'Theme parks';
  if (tags.natural === 'beach' || tags.leisure === 'beach_resort') return 'Beaches';
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'Parks & gardens';
  if (tags.leisure === 'nature_reserve') return 'Outdoors';
  if (tags.historic) return 'Landmarks';
  return 'Attractions';
}

// Build one Overpass QL query over a bounding box around the trip's centre.
function buildQuery({ lat, lng, radiusM = 12000, limit = 50 }) {
  // Overpass wants (south,west,north,east). Degrees per metre varies with
  // latitude for longitude, so scale it — a fixed delta is badly wrong in LA.
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const bbox = `${(lat - dLat).toFixed(5)},${(lng - dLng).toFixed(5)},${(lat + dLat).toFixed(5)},${(lng + dLng).toFixed(5)}`;
  const parts = FILTERS.map((f) => `${f}(${bbox});`).join('');
  // `out center` gives ways/relations a representative point without geometry.
  return `[out:json][timeout:20];(${parts});out center ${limit};`;
}

function mapOsmElement(el) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:en'];
  if (!name) return null;                        // unnamed POIs are noise
  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;
  if (lat == null || lng == null) return null;

  // Prefer the POI's own site; else its OSM page (always resolvable).
  const url = tags.website || tags['contact:website'] || `https://www.openstreetmap.org/${el.type}/${el.id}`;
  // `fee=no` is an explicit "free"; anything else we leave unknown rather than guess.
  const free = tags.fee === 'no' || tags.fee === 'No';

  return {
    id: `osm:${el.type}/${el.id}`,
    source: 'osm',
    title: String(name).slice(0, 120),
    category: osmCategory(tags),
    // OSM has no pricing. `price: 0` would be a lie for ticketed museums, so we
    // only assert free when the data says so, and leave the rest null.
    price: free ? 0 : null,
    currency: free ? 'USD' : null,
    originalPrice: null,
    priceUnit: free ? 'guest' : null,
    rating: null,
    reviews: null,
    url,
    photo: tags.image && /^https?:\/\//.test(tags.image) ? tags.image : null,
    lat, lng,
    duration: null,
    // Kept so the UI can show provenance and a later pass can join on Wikidata.
    wikidata: tags.wikidata || null,
  };
}

/** Free things to do near a point. Soft-fails to [] — never throws. */
async function searchOsmAttractions({ lat, lng, radiusM = 12000, limit = 50 } = {}) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    console.warn('[osm] no coordinates given — returning []');
    return [];
  }
  const body = buildQuery({ lat, lng, radiusM, limit });
  for (const mirror of MIRRORS) {
    const t0 = Date.now();
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), MIRROR_TIMEOUT_MS);
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'text/plain', Accept: 'application/json' },
        body,
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (!res.ok) { console.warn(`[osm] ${new URL(mirror).host} → ${res.status}, trying next mirror`); continue; }
      const data = await res.json();
      if (!(data.elements || []).length) { console.warn(`[osm] ${new URL(mirror).host} → 200 but 0 elements (server-side timeout), trying next mirror`); continue; }
      const rows = (data.elements || []).map(mapOsmElement).filter(Boolean);
      // Dedupe by name+rounded position: OSM often has a node AND a way for the
      // same park, which would otherwise show up twice on the board.
      const seen = new Set();
      const out = [];
      for (const r of rows) {
        const k = `${r.title.toLowerCase()}|${r.lat.toFixed(3)},${r.lng.toFixed(3)}`;
        if (seen.has(k)) continue;
        seen.add(k); out.push(r);
      }
      console.log(`[osm] ${out.length} places from ${new URL(mirror).host} in ${Date.now() - t0}ms`);
      return out;
    } catch (e) {
      console.warn(`[osm] ${new URL(mirror).host} failed (${e.name === 'AbortError' ? 'timeout' : e.message}), trying next mirror`);
    }
  }
  console.warn('[osm] all mirrors failed — returning []');
  return [];
}

module.exports = { searchOsmAttractions, mapOsmElement, buildQuery, osmCategory };

// Dev CLI:  node osm.js 34.0522 -118.2437
if (require.main === module) {
  const lat = parseFloat(process.argv[2] || '34.0522');
  const lng = parseFloat(process.argv[3] || '-118.2437');
  searchOsmAttractions({ lat, lng, limit: 40 }).then((rows) => {
    console.log(`\n${rows.length} places`);
    console.log(JSON.stringify(rows.slice(0, 5), null, 1));
  });
}
