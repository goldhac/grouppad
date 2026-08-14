#!/usr/bin/env node
/**
 * Send a one-off announcement to everyone with a GroupPad account.
 *
 *   node scripts/send-announcement.js                          # dry run (default)
 *   node scripts/send-announcement.js --only you@example.com   # one real send, to yourself
 *   node scripts/send-announcement.js --send                   # the real thing
 *
 * DRY RUN IS THE DEFAULT AND THAT IS DELIBERATE. This is the one script here
 * that touches people outside the product, and it cannot be undone — there is
 * no unsend. You should have to ask for it twice.
 *
 * What it guarantees:
 *  · Anyone who has unsubscribed is skipped. Their opt-out already exists in
 *    users.json (`notif.digest/instant`); an announcement is not a loophole.
 *  · Every recipient gets their OWN unsubscribe link, minted from the same
 *    stable token the trip emails use, so one click kills all of it.
 *  · `List-Unsubscribe` + `List-Unsubscribe-Post` headers, so Gmail and Apple
 *    Mail show their native unsubscribe control. Without these a bulk send from
 *    a young domain is a spam-folder bet, and it's a legal requirement in most
 *    of the places this list lives.
 *  · Sends one at a time with a pause, rather than hammering the API.
 */
const fs = require('fs');
const path = require('path');

const ARG = process.argv.slice(2);
const has = (f) => ARG.includes(f);
const val = (f) => { const i = ARG.indexOf(f); return i >= 0 ? ARG[i + 1] : null; };

const SEND = has('--send') || !!val('--only');
const ONLY = val('--only');
const HTML_FILE = val('--html') || path.join(__dirname, '..', 'docs', 'emails', '07-early-access-scout.html');
const SUBJECT = val('--subject') || 'You were here first — and Scout just learned to plan your day';
const DATA_DIR = process.env.PIPELINE_DATA_DIR || path.join(__dirname, '..', 'data');
const BASE = process.env.APP_BASE_URL || 'https://grouppad.goldhac.com';
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'GroupPad <onboarding@resend.dev>';
const GAP_MS = Number(process.env.ANNOUNCE_GAP_MS || 600);

const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function recipients() {
  const file = path.join(DATA_DIR, 'users.json');
  const users = JSON.parse(fs.readFileSync(file, 'utf8'));
  let dirty = false;
  const out = [];
  for (const u of Object.values(users)) {
    if (!u || !isEmail(u.email)) continue;
    const n = u.notif || {};
    // Opt-out model, same as notifPrefs() in server.js: absent means subscribed.
    // Someone who turned everything off has unsubscribed — respect it.
    if (n.digest === false && n.instant === false) { out.push({ email: u.email, skipped: 'unsubscribed' }); continue; }
    if (!u.unsub) {
      u.unsub = require('crypto').randomBytes(16).toString('hex');
      dirty = true;
    }
    out.push({ id: u.id, email: u.email, name: u.name || String(u.email).split('@')[0], unsub: u.unsub });
  }
  // Persist any freshly minted tokens, or the links in the mail we just sent
  // would point at nothing.
  if (dirty && SEND) fs.writeFileSync(file, JSON.stringify(users, null, 2));
  else if (dirty) console.log('  (dry run: would mint unsubscribe tokens for new recipients)');
  return out;
}

async function send(to, html, unsubUrl) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: SUBJECT,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body?.message || JSON.stringify(body).slice(0, 140)}`);
  return body.id;
}

async function main() {
  const template = fs.readFileSync(HTML_FILE, 'utf8');
  const left = template.match(/\{\{(\w+)\}\}/g) || [];
  const unknown = [...new Set(left)].filter((t) => t !== '{{unsubscribe}}');
  if (unknown.length) {
    console.error(`Refusing to send: unresolved merge tokens ${unknown.join(', ')}`);
    process.exit(1);
  }

  let list = recipients();
  const skipped = list.filter((r) => r.skipped);
  list = list.filter((r) => !r.skipped);
  if (ONLY) list = list.filter((r) => r.email.toLowerCase() === ONLY.toLowerCase());

  console.log(`\n${SEND ? (ONLY ? 'TEST SEND' : 'LIVE SEND') : 'DRY RUN'} — "${SUBJECT}"`);
  console.log(`  from      : ${FROM}`);
  console.log(`  template  : ${path.relative(process.cwd(), HTML_FILE)}`);
  console.log(`  recipients: ${list.length}${skipped.length ? `  (${skipped.length} unsubscribed, skipped)` : ''}`);
  if (!KEY && SEND) { console.error('\nRESEND_API_KEY is not set — nothing sent.'); process.exit(1); }
  if (!list.length) { console.log('\nNobody to send to.'); return; }

  let ok = 0, failed = 0;
  for (const r of list) {
    const unsubUrl = `${BASE}/api/notify/unsubscribe?u=${encodeURIComponent(r.unsub)}`;
    const html = template.replace(/\{\{unsubscribe\}\}/g, unsubUrl);
    if (!SEND) { console.log(`  · would send → ${r.email}`); continue; }
    try {
      const id = await send(r.email, html, unsubUrl);
      ok++; console.log(`  ✓ ${r.email}  (${id})`);
    } catch (e) {
      failed++; console.error(`  ✗ ${r.email}  ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, GAP_MS));
  }

  if (SEND) console.log(`\nsent ${ok}${failed ? `, ${failed} failed` : ''}`);
  else console.log(`\nNothing was sent. Re-run with --only <your email> to test, then --send.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
