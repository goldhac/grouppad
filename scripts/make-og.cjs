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

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    background:#0f1115; color:#fff; overflow:hidden; position:relative; }
  .glow { position:absolute; top:-220px; right:-160px; width:620px; height:620px; border-radius:50%;
    background:radial-gradient(circle, rgba(47,109,246,.45), rgba(47,109,246,0) 70%); filter:blur(8px); }
  .wrap { position:absolute; inset:0; padding:72px 80px; display:flex; flex-direction:column; justify-content:space-between; }
  .brand { display:flex; align-items:center; gap:16px; }
  .mark { width:40px; height:40px; background:#2f6df6; border-radius:11px; }
  .brand span { font-size:34px; font-weight:700; letter-spacing:-.02em; }
  h1 { font-size:82px; line-height:1.04; font-weight:800; letter-spacing:-.03em; max-width:900px; }
  h1 b { color:#6ea0ff; }
  .sub { margin-top:26px; font-size:30px; color:#9aa3b2; font-weight:500; }
  .chips { display:flex; gap:12px; margin-top:6px; }
  .chip { font-size:22px; color:#cbd5e1; background:#1a1f29; border:1px solid #262d3a; border-radius:999px; padding:9px 18px; }
  .foot { font-size:24px; color:#6b7480; }
</style></head><body>
  <div class="glow"></div>
  <div class="wrap">
    <div class="brand"><div class="mark"></div><span>GroupPad</span></div>
    <div>
      <h1>Pick one place,<br><b>together.</b></h1>
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
