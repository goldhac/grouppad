#!/usr/bin/env node
/* Render the social link-preview image → client/public/og.png (1200×630). */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(__dirname, '..', 'client', 'public');
const OUT = path.join(OUT_DIR, 'og.png');
fs.mkdirSync(OUT_DIR, { recursive: true });

const HTML = `<!doctype html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Fraunces:opsz,wght@9..144,400..700&display=swap" rel="stylesheet">
  <style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; font-family:'Hanken Grotesk',-apple-system,sans-serif;
    background:#14161B; color:#F5F4EF; overflow:hidden; position:relative; }
  .glow { position:absolute; top:-240px; right:-180px; width:680px; height:680px; border-radius:50%;
    background:radial-gradient(circle, rgba(35,117,104,.42), rgba(35,117,104,0) 70%); filter:blur(8px); }
  .wrap { position:absolute; inset:0; padding:74px 84px; display:flex; flex-direction:column; justify-content:space-between; }
  .brand { display:flex; align-items:center; gap:16px; }
  .brand span { font-family:'Fraunces',serif; font-size:38px; font-weight:600; letter-spacing:-.02em; color:#F5F4EF; }
  h1 { font-family:'Bricolage Grotesque',sans-serif; font-size:84px; line-height:1.02; font-weight:800; letter-spacing:-.03em; max-width:920px; }
  h1 b { font-family:'Fraunces',serif; font-style:italic; font-weight:500; color:#6FC2B2; }
  .chips { display:flex; gap:12px; margin-top:30px; }
  .chip { font-size:22px; color:#B9C0B9; background:#1F2C29; border:1px solid #2C3936; border-radius:999px; padding:9px 18px; }
  .foot { font-size:24px; color:#98A19B; }
</style></head><body>
  <div class="glow"></div>
  <div class="wrap">
    <div class="brand">
      <svg width="46" height="46" viewBox="0 0 360 360" fill="none">
        <path d="M67.5 187.5 L180 90 L292.5 187.5" stroke="#F5F4EF" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M99 165 V276 H261 V165" stroke="#F5F4EF" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="180" cy="220.5" r="24" fill="#D7A12E"/>
      </svg>
      <span>GroupPad</span>
    </div>
    <div>
      <h1>Pick the place your group <b>actually agrees</b> on.</h1>
      <div class="chips">
        <div class="chip">Browse rentals</div>
        <div class="chip">Vote</div>
        <div class="chip">Compare with AI</div>
        <div class="chip">Lock the winner</div>
      </div>
    </div>
    <div class="foot">One shared board for the whole group</div>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(HTML, { waitUntil: 'networkidle' });
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log('✓ wrote', OUT, fs.statSync(OUT).size, 'bytes');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
