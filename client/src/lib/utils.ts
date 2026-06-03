import type { Listing, VoteDir, VotesMap, YesNoUnknown } from '@/types';

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
