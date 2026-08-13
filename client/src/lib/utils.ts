import type { Experience, Listing, TripView, VoteDir, VotesMap, YesNoUnknown } from '@/types';

/** Hardcoded trip params used to build "open with dates" links (matches legacy app). */
export const TRIP = {
  checkin: '2026-08-18',
  checkout: '2026-08-23',
  adults: 14,
} as const;

/** Currency formatter: null → "—", else "$1,234". */
export function fmt(n: number | null | undefined): string {
  return n == null ? '—' : '$' + Number(n).toLocaleString();
}

export function money(n: number | null | undefined): string {
  return n == null ? '—' : '$' + Number(n).toFixed(2);
}

export function num(n: number | null | undefined): string {
  return n == null ? '—' : Number(n).toLocaleString();
}

/** Tally up/down votes for a listing, plus the current user's own vote. */
export function tallyVotes(
  votes: VotesMap,
  listingId: string,
  myId: string | null,
): { up: number; down: number; mine: VoteDir | null } {
  const entry = votes[listingId] || {};
  let up = 0;
  let down = 0;
  for (const v of Object.values(entry)) {
    if (v === 'up') up++;
    else if (v === 'down') down++;
  }
  const mine = myId ? entry[myId] ?? null : null;
  return { up, down, mine };
}

export function netVotes(votes: VotesMap, listingId: string): number {
  const t = tallyVotes(votes, listingId, null);
  return t.up - t.down;
}

/** Secondary sort key — prioritizes big / luxury homes. */
export function mansionScore(l: Listing): number {
  let s = (l.bd ?? 0) * 2 + (l.sleeps ?? 0) * 0.3;
  if (/mansion|estate|villa|manor|chateau|grand|luxur/i.test(l.name || '')) s += 8;
  return s;
}

export function amenityLabel(key: string, val: YesNoUnknown | undefined): {
  text: string;
  state: 'yes' | 'no' | 'unknown';
} {
  if (val === 'yes') return { text: `✓ ${key}`, state: 'yes' };
  if (val === 'no') return { text: `✗ ${key}`, state: 'no' };
  return { text: `? ${key}`, state: 'unknown' };
}

/**
 * Build an "open with the trip dates pre-filled" URL for a pasted listing link.
 * Returns null if the URL is not a valid http/https URL.
 */
export function openWithDatesUrl(raw: string): { href: string; label: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.replace(/^www\./, '');
  const { checkin, checkout, adults } = TRIP;

  if (host.includes('airbnb.')) {
    u.searchParams.set('check_in', checkin);
    u.searchParams.set('check_out', checkout);
    u.searchParams.set('adults', String(adults));
    return { href: u.toString(), label: 'Open with trip dates →' };
  }
  if (host.includes('vrbo.') || host.includes('homeaway.')) {
    u.searchParams.set('startDate', checkin);
    u.searchParams.set('endDate', checkout);
    u.searchParams.set('adults', String(adults));
    return { href: u.toString(), label: 'Open with trip dates →' };
  }
  if (host.includes('booking.')) {
    const clean = new URL(u.origin + u.pathname);
    clean.searchParams.set('checkin', checkin);
    clean.searchParams.set('checkout', checkout);
    clean.searchParams.set('group_adults', String(adults));
    return { href: clean.toString(), label: 'Open with trip dates →' };
  }
  return { href: u.toString(), label: 'Open listing →' };
}

/** Minimal, safe Markdown → HTML for AI compare/insights output. */
export function mdToHtml(md: string): string {
  if (!md) return '';
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let i = 0;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Pipe table: header row followed by a |---|---| separator.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const cells = (row: string) =>
        row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push('<table class="cmp-table"><thead><tr>');
      out.push(headers.map((h) => `<th>${inline(h)}</th>`).join(''));
      out.push('</tr></thead><tbody>');
      for (const r of rows) {
        out.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      }
      out.push('</tbody></table>');
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    const ulItem = line.match(/^\s*[-*]\s+(.*)$/);
    const olItem = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ulItem || olItem) {
      const want: 'ul' | 'ol' = ulItem ? 'ul' : 'ol';
      if (listType !== want) {
        closeList();
        out.push(`<${want}>`);
        listType = want;
      }
      out.push(`<li>${inline((ulItem ?? olItem)![1])}</li>`);
      i++;
      continue;
    }

    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join('\n');
}

/**
 * Straight-line miles between two coordinates (haversine), one decimal.
 * Client sibling of server.js/pipeline.js `haversineMi` — but WITHOUT their
 * 1.25 road factor: experience distances read "X mi from …", not drive
 * estimates, so we don't fake routing. Returns null on any bad input.
 */
export function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number | null {
  if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || isNaN(v))) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** Where experience distances are measured FROM (spec: experiences.md §4 Phase 2). */
export interface ExpAnchor {
  lat: number;
  lng: number;
  /** Honest label for the UI: "your place" or the ref point's name. */
  label: string;
  /** True when anchored on the home itself (real coords), not an area ref point. */
  fromHome: boolean;
}

/**
 * Best available anchor for "X mi from …" on experiences: the home's own
 * coords when the scrape captured them (submitted homes often do), else the
 * trip's primary reference point (downtown → airport → attraction). Curated
 * and pipeline homes carry precomputed `distances` chips but NO lat/lng, so
 * the ref-point fallback keeps the label honest rather than faking a
 * from-the-home number. Null → hide all distance UI.
 */
export function expAnchor(l: Listing | null | undefined, trip: TripView | null): ExpAnchor | null {
  if (l && typeof l.lat === 'number' && typeof l.lng === 'number') {
    return { lat: l.lat, lng: l.lng, label: 'your place', fromHome: true };
  }
  const refs = trip?.ref_points;
  const p = refs?.downtown ?? refs?.airport ?? refs?.attraction;
  if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
    return { lat: p.lat, lng: p.lng, label: p.name || 'the area center', fromHome: false };
  }
  return null;
}

/** Miles from an anchor to an experience, or null when it has no coords. */
export function expDistanceMi(anchor: ExpAnchor | null, x: Experience): number | null {
  if (!anchor || x.lat == null || x.lng == null) return null;
  return haversineMi(anchor.lat, anchor.lng, x.lat, x.lng);
}

/** Minutes → "14 min" / "1h 5m". */
export function fmtMins(min: number): string {
  if (min == null) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}
