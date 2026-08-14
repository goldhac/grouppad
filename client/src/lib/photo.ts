/**
 * Ask the CDN for a photo at the size we actually paint it.
 *
 * Airbnb's image host takes an `im_w` query param (server.js already leans on
 * it for thumbnails). Without it every card downloads and decodes a ~1440px
 * JPEG to fill a ~360px slot — the decode is main-thread work that lands in the
 * middle of a scroll, which is a big part of why the phone board felt draggy.
 *
 * Widths are CSS px; we double for retina and round to the CDN's useful steps.
 * A URL that already carries a query string is left alone — it has been sized
 * by somebody who knew what they wanted.
 */
const STEPS = [240, 360, 480, 720, 960, 1200, 1440];

export function photoAt(url: string | null | undefined, cssWidth: number): string {
  if (!url || url.includes('?')) return url || '';
  if (!/a0\.muscache\.com/.test(url)) return url;
  const want = cssWidth * Math.min(2, Math.ceil(window.devicePixelRatio || 1));
  const w = STEPS.find((s) => s >= want) ?? STEPS[STEPS.length - 1];
  return `${url}?im_w=${w}`;
}

/** The three slots that repeat enough to matter. */
export const photoCard = (u?: string | null) => photoAt(u, 380);
export const photoHero = (u?: string | null) => photoAt(u, 430);
export const photoThumb = (u?: string | null) => photoAt(u, 80);
