#!/usr/bin/env node
/* Send one of each GroupPad email template to a test inbox so the design can be
 * reviewed in a real client. Usage: RESEND_API_KEY=... node scripts/email-preview.cjs [to] */
'use strict';
const E = require('../emails');

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'GroupPad <trips@send.goldhac.com>';
const TO = process.argv[2] || 'gold.nwobu@gmail.com';
const BASE = 'https://exquisite-inspiration-production-7511.up.railway.app';
if (!KEY) { console.error('RESEND_API_KEY required'); process.exit(1); }

const samples = [
  ['[Preview] Sign-in link', E.magicLink({ appBase: BASE, link: `${BASE}/#/?token=demo` })],
  ['[Preview] You’re invited', E.invite({ appBase: BASE, tripName: 'LA Birthday 2026', destination: 'Los Angeles', inviter: 'Gold', link: `${BASE}/#/t/la-birthday-2026/board?join=demo` })],
  ['[Preview] New member joined', E.joined({ appBase: BASE, tripName: 'LA Birthday 2026', who: 'Sam', boardUrl: `${BASE}/#/t/la-birthday-2026/board`, unsub: 'demo' })],
  ['[Preview] It’s official', E.decisionLocked({ appBase: BASE, tripName: 'LA Birthday 2026', listingName: 'Huge 7BR Pad: Downtown 15m', boardUrl: `${BASE}/#/t/la-birthday-2026/board`, unsub: 'demo' })],
  ['[Preview] Daily recap', E.digest({ appBase: BASE, tripName: 'LA Birthday 2026', boardUrl: `${BASE}/#/t/la-birthday-2026/board`,
    rowsHtml: E.digestRow('3 new homes', ['Sam added "Sunset Villa"', 'Alex added "Venice Loft"', 'Gold added "Hollywood Hills Estate"'])
            + E.digestRow('2 new must-haves', ['Sam: "needs a pool"', 'Alex: "walkable to food"'])
            + E.digestRow('12 votes', [])
            + E.digestRow('4 top-choice picks', []),
    unsub: 'demo' })],
  ['[Preview] You’re now an organizer', E.organizerAdded({ appBase: BASE, tripName: 'LA Birthday 2026', promotedBy: 'Gold', boardUrl: `${BASE}/#/t/la-birthday-2026/board`, manageUrl: `${BASE}/#/t/la-birthday-2026/manage`, unsub: 'demo' })],
  ['[Preview] You’re the trip creator', E.creatorTransferred({ appBase: BASE, tripName: 'LA Birthday 2026', from: 'Gold', boardUrl: `${BASE}/#/t/la-birthday-2026/board`, manageUrl: `${BASE}/#/t/la-birthday-2026/manage`, unsub: 'demo' })],
];

(async () => {
  for (const [subject, html] of samples) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(res.ok ? `✓ sent` : `✗ ${res.status}`, subject, '->', body.id || JSON.stringify(body));
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
