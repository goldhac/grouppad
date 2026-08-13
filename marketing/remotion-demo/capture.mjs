// Capture real GroupPad screens at 1440x900 @2x for the demo video.
// Drives the cached Chromium via playwright-core against the local server.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EXEC = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64',
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
);
const BASE = 'http://localhost:3000';
const TRIP = 'la-birthday-2026';
const OUT = join(import.meta.dirname, 'public', 'shots');
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[cap]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

// Skip onboarding / tour / welcome overlays so we capture the clean product.
await page.addInitScript(() => {
  const flags = {
    gp_onboarded: '1', gp_onboarding_done: '1', gp_tour_seen: '1',
    gp_welcome_seen: '1', gp_site_tour_done: '1', gp_seen_tour: '1',
  };
  for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, v);
});

async function go(hash) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
}
async function shot(name, clip) {
  const path = join(OUT, name);
  await page.screenshot({ path, clip });
  log('saved', name, clip ? `clip ${clip.width}x${clip.height}` : 'viewport');
}
async function tryClickText(text, opts = {}) {
  try {
    const el = page.getByText(text, { exact: false }).first();
    await el.click({ timeout: opts.timeout || 3000 });
    return true;
  } catch { return false; }
}

try {
  // ── Board ──────────────────────────────────────────────────────────────
  await go(`/t/${TRIP}/board`);
  await page.waitForFunction(
    () => document.body.innerText.includes('Top recommended') ||
          document.body.innerText.includes('Recommended'),
    { timeout: 20000 }
  ).catch(() => log('board text wait timed out'));
  await sleep(2500); // let images decode
  // dismiss any stray overlay
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  await shot('board-top.png', { x: 0, y: 0, width: 1440, height: 900 });

  // Scroll to the recommended grid so multiple homes + per-person prices show.
  await page.evaluate(() => window.scrollTo(0, 520));
  await sleep(900);
  await shot('board-grid.png', { x: 0, y: 0, width: 1440, height: 900 });

  // Tight crop of a single real card (the per-person hero). Find the card whose
  // text contains a "/ person" price and clip to its bounding box.
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(600);
    const box = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('*')].filter((el) => {
        const t = el.innerText || '';
        return /\/\s*person/i.test(t) && t.length < 320 &&
          el.querySelector('img') && el.getBoundingClientRect().width > 180 &&
          el.getBoundingClientRect().width < 520;
      });
      if (!cards.length) return null;
      const r = cards[0].getBoundingClientRect();
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
    });
    if (box) {
      await page.screenshot({ path: join(OUT, 'card.png'), clip: box });
      log('saved card.png', `clip ${Math.round(box.width)}x${Math.round(box.height)}`);
    } else log('no /person card found for crop');
  } catch (e) { log('card crop failed', e.message); }

  // Full board (tall) for pan/scroll motion.
  const fullH = await page.evaluate(() => Math.min(document.body.scrollHeight, 2600));
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  await page.screenshot({ path: join(OUT, 'board-full.png'), fullPage: false, clip: { x: 0, y: 0, width: 1440, height: Math.min(900, fullH) } });

  // ── Detail modal (per-person price) ────────────────────────────────────
  await page.evaluate(() => window.scrollTo(0, 520));
  await sleep(500);
  let opened = false;
  // Click the first listing card title/image.
  for (const sel of ['.card img', '[class*="card"] img', 'article img', 'main img']) {
    try {
      await page.locator(sel).first().click({ timeout: 2500 });
      opened = true; break;
    } catch {}
  }
  if (opened) {
    await sleep(1800);
    await shot('detail.png', { x: 0, y: 0, width: 1440, height: 900 });
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(600);
  } else log('could not open detail modal');

  // ── Decision tab / leaderboard ─────────────────────────────────────────
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  if (await tryClickText('Decision')) {
    await sleep(1400);
    await shot('decision.png', { x: 0, y: 0, width: 1440, height: 900 });
  }
  // Leaderboard button
  await go(`/t/${TRIP}/board`);
  await sleep(2500);
  if (await tryClickText('Leaderboard')) {
    await sleep(1400);
    await shot('leaderboard.png', { x: 0, y: 0, width: 1440, height: 900 });
    await page.keyboard.press('Escape').catch(() => {});
  }
} catch (e) {
  log('ERROR', e.message);
} finally {
  await browser.close();
  log('done');
}
