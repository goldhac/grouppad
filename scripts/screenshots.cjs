#!/usr/bin/env node
/* One-off: capture documentation screenshots of every GroupPad page + modal.
 * Usage: GP_SID=<session> node scripts/screenshots.cjs
 * Requires the local server running on :3000 and a Chrome binary. */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3000';
const TRIP = 'la-birthday-2026';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const SID = process.env.GP_SID;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, { full = false } = {}) {
  try {
    await page.screenshot({ path: path.join(OUT, name), fullPage: full });
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, e.message);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const viewport = { width: 1440, height: 900 };
  const dsf = 2;

  // ── Signed-out context ──────────────────────────────────────────────
  const out = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const po = await out.newPage();

  await po.goto(`${BASE}/#/`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(1200);
  await shot(po, '01-landing.png', { full: true });

  // Auth modal
  try {
    await po.getByRole('button', { name: 'Sign in' }).first().click({ timeout: 4000 });
    await sleep(700);
    await shot(po, '02-auth-modal.png');
  } catch (e) { console.log('auth modal:', e.message); }

  // Onboarding modal
  try {
    await po.goto(`${BASE}/#/`, { waitUntil: 'networkidle' }).catch(() => {});
    await sleep(600);
    await po.getByText('30-second tour').first().click({ timeout: 4000 });
    await sleep(700);
    await shot(po, '03-onboarding.png');
  } catch (e) { console.log('onboarding:', e.message); }

  // Help (trip-scoped, viewable signed-out)
  await po.goto(`${BASE}/#/t/${TRIP}/help`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(900);
  await shot(po, '11-help.png', { full: true });

  // ── Signed-in (owner) context ───────────────────────────────────────
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  if (SID) await ctx.addCookies([{ name: 'gp_session', value: SID, domain: 'localhost', path: '/', sameSite: 'Lax' }]);
  const p = await ctx.newPage();

  await p.goto(`${BASE}/#/trips`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(1000);
  await shot(p, '04-trips-dashboard.png', { full: true });

  await p.goto(`${BASE}/#/trips/new`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(900);
  await shot(p, '05-create-trip.png', { full: true });

  // Board — let images load, then full-page + top viewport
  await p.goto(`${BASE}/#/t/${TRIP}/board`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(3500);
  await shot(p, '06-board-top.png');
  await shot(p, '07-board-full.png', { full: true });

  // Detail modal — click a card's title
  try {
    await p.locator('article h2').first().click({ timeout: 4000 });
    await sleep(1500);
    await shot(p, '08-detail-modal.png');
    await p.keyboard.press('Escape');
    await sleep(500);
  } catch (e) { console.log('detail:', e.message); }

  // Comparison VS modal — tick 2 compare checkboxes, run 1v1
  try {
    const boxes = p.locator('article label:has-text("compare") input[type="checkbox"]');
    await boxes.nth(0).check({ timeout: 4000 });
    await boxes.nth(1).check({ timeout: 4000 });
    await sleep(600);
    await p.getByRole('button', { name: /1v1/ }).first().click({ timeout: 4000 });
    await sleep(7000); // wait for Gemini verdict
    await shot(p, '09-comparison-vs.png');
    await p.keyboard.press('Escape');
    await sleep(500);
  } catch (e) { console.log('comparison:', e.message); }

  // Manage (owner)
  await p.goto(`${BASE}/#/t/${TRIP}/manage`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(1200);
  await shot(p, '10-manage.png', { full: true });

  // Platform admin (key-entry state)
  await p.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(900);
  await shot(p, '12-admin.png', { full: true });

  await browser.close();
  console.log('done →', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
