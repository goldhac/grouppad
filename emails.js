'use strict';
// Premium, table-based, inline-styled email templates. One shared shell so every
// message looks consistent. Pure functions (no app state) — also used by the
// preview/test script. Keep it email-client-safe: tables, inline CSS, no flex/grid.

const ACCENT = '#2f6df6';
const INK = '#0f172a';
const BODY = '#475569';
const MUTED = '#94a3b8';
const LINE = '#e7ebf0';
const CANVAS = '#eef1f5';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// The shared chrome: branded header, eyebrow + title, body, optional CTA, footer.
function shell({ appBase = '', preheader = '', eyebrow = '', title = '', bodyHtml = '', ctaText = '', ctaHref = '', unsub = '' }) {
  const button = ctaText && ctaHref
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px">
         <tr><td style="border-radius:10px;background:${ACCENT}">
           <a href="${ctaHref}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${esc(ctaText)} &rarr;</a>
         </td></tr></table>`
    : '';
  const unsubLink = unsub
    ? `<a href="${appBase}/api/notify/unsubscribe?u=${unsub}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a> &middot; `
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
  <tr><td style="padding:20px 32px;border-bottom:1px solid ${CANVAS}">
    <span style="font-size:16px;font-weight:700;color:${INK};letter-spacing:-.01em">
      <span style="display:inline-block;width:16px;height:16px;background:${ACCENT};border-radius:5px;vertical-align:-2px;margin-right:8px"></span>GroupPad
    </span>
  </td></tr>
  <tr><td style="padding:32px 32px 4px">
    ${eyebrow ? `<p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${ACCENT}">${esc(eyebrow)}</p>` : ''}
    <h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;font-weight:700;color:${INK}">${title}</h1>
    <div style="font-size:15px;line-height:1.65;color:${BODY}">${bodyHtml}</div>
    ${button}
  </td></tr>
  <tr><td style="padding:26px 32px 28px">
    <div style="border-top:1px solid ${CANVAS};padding-top:18px;font-size:12px;line-height:1.6;color:${MUTED}">
      ${unsubLink}GroupPad — pick one place, together.
    </div>
  </td></tr>
</table>
<p style="margin:18px 0 0;font-size:11px;color:#b9c0cb">Sent by GroupPad</p>
</td></tr></table></body></html>`;
}

// A tidy "stat" list row for the digest.
function digestRow(headline, samples) {
  const sub = samples && samples.length
    ? `<ul style="margin:8px 0 0;padding-left:18px">${samples.map((s) => `<li style="margin:3px 0;color:${BODY};font-size:13px">${esc(s)}</li>`).join('')}</ul>`
    : '';
  return `<tr><td style="padding:14px 16px;border:1px solid ${LINE};border-radius:12px">
    <span style="font-size:15px;font-weight:600;color:${INK}">${esc(headline)}</span>${sub}
  </td></tr><tr><td style="height:10px;line-height:10px">&nbsp;</td></tr>`;
}

// ── Builders ───────────────────────────────────────────────────────────────────
function magicLink({ appBase, link }) {
  return shell({
    appBase, preheader: 'Your GroupPad sign-in link (expires in 15 min)',
    eyebrow: 'Sign in', title: 'Tap to sign in to GroupPad',
    bodyHtml: `<p style="margin:0">Click the button below to finish signing in. This link works once and expires in <b>15 minutes</b>.</p>
               <p style="margin:14px 0 0;color:${MUTED};font-size:13px">If you didn't request this, you can safely ignore it.</p>`,
    ctaText: 'Sign in', ctaHref: link,
  });
}

function invite({ appBase, tripName, destination, inviter, link }) {
  return shell({
    appBase, preheader: `${inviter} invited you to ${tripName} on GroupPad`,
    eyebrow: "You're invited", title: `Help pick the place for ${esc(tripName)}`,
    bodyHtml: `<p style="margin:0"><b>${esc(inviter)}</b> invited you to weigh in${destination ? ` on the ${esc(destination)} trip` : ''} on GroupPad — browse homes, vote, and add your own finds.</p>`,
    ctaText: 'Join the trip', ctaHref: link,
  });
}

function joined({ appBase, tripName, who, boardUrl, unsub }) {
  return shell({
    appBase, preheader: `${who} joined ${tripName}`,
    eyebrow: 'New member', title: `${esc(who)} joined ${esc(tripName)}`,
    bodyHtml: `<p style="margin:0">Your group is coming together — they can now browse, vote, and add homes to the board.</p>`,
    ctaText: 'Open the board', ctaHref: boardUrl, unsub,
  });
}

function decisionLocked({ appBase, tripName, listingName, boardUrl, unsub }) {
  return shell({
    appBase, preheader: `${listingName} is the pick for ${tripName}`,
    eyebrow: "It's official", title: `${esc(tripName)} has a winner`,
    bodyHtml: `<p style="margin:0">The organizer locked in <b style="color:${INK}">${esc(listingName)}</b> as the group's pick. Time to book your spot.</p>`,
    ctaText: 'See the pick', ctaHref: boardUrl, unsub,
  });
}

function digest({ appBase, tripName, boardUrl, rowsHtml, unsub }) {
  return shell({
    appBase, preheader: `What your group did on ${tripName} in the last day`,
    eyebrow: 'Daily recap', title: esc(tripName),
    bodyHtml: `<p style="margin:0 0 18px">Here's what your group got up to in the last day.</p>
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table>`,
    ctaText: 'Open the board', ctaHref: boardUrl, unsub,
  });
}

module.exports = { esc, shell, digestRow, magicLink, invite, joined, decisionLocked, digest, ACCENT };
