'use strict';
// Email-safe HTML templates — ported 1:1 from the v2 design suite
// (design-v2 "GroupPad Emails"). 600px tables, all-inline CSS, VML buttons for
// Outlook, dark-mode media queries. Bricolage Grotesque (display) + Hanken
// Grotesk (body) with web-safe fallbacks. The v2 palette throughout; gold is
// reserved for the decision/official-pick beat. Pure functions (also used by
// scripts/email-preview.cjs). Images are hosted under <appBase>/email/.

const TEAL = '#134E4A';        // accent / buttons / headings
const TEAL_EYE = '#2E8C7C';    // eyebrow + links
const TEAL_LIGHT = '#A8D8CE';  // subtitle on teal banner
const GOLD_EYE = '#E6BC54';    // eyebrow on the teal banner
const INK = '#16201E';         // strong body text
const BODY = '#45514F';        // body text
const MUTED = '#7B847D';       // muted
const GREEN = '#1F7A50';       // per-person / under-budget
const BG = '#EFE7DA';          // warm page
const CARD = '#FFFDF8';        // paper card
const BORDER = '#E7DDC9';      // hairline
const CHIP = '#F6EFE1';        // tinted block
const BTN_FG = '#F6EFE1';
const ACCENT = TEAL;           // back-compat export

const DISPLAY = "'Bricolage Grotesque',Georgia,'Segoe UI',sans-serif";
const SANS = "'Hanken Grotesk',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

const HEAD = `<!DOCTYPE html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="x-apple-disable-message-reformatting"/><meta name="color-scheme" content="light dark"/><meta name="supported-color-schemes" content="light dark"/>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;} img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;} a{text-decoration:none;}
  @media only screen and (max-width:600px){.ec-card{width:100%!important;border-radius:0!important;}.ec-pad{padding-left:24px!important;padding-right:24px!important;}}
  @media (prefers-color-scheme:dark){.ec-bg{background:#0F1716!important;}.ec-card{background:#15201E!important;border-color:#2C3936!important;}.ec-ink{color:#EDE7D9!important;}.ec-muted{color:#B9C0B9!important;}.ec-rule{border-color:#2C3936!important;}.ec-foot{color:#98A19B!important;}.ec-row,.ec-chip,.ec-stat{background:#1A2624!important;border-color:#2C3936!important;}}
</style></head>`;

// A bulletproof button (VML for Outlook + HTML for everyone else).
function btn(href, label, width = 220) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td>
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:${width}px;" arcsize="20%" strokecolor="${TEAL}" fillcolor="${TEAL}"><w:anchorlock/><center style="color:${BTN_FG};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!-- -->
<a href="${href}" style="background-color:${TEAL};border-radius:10px;color:${BTN_FG};display:inline-block;font-family:${SANS};font-size:16px;font-weight:700;line-height:50px;text-align:center;text-decoration:none;width:${width}px;">${esc(label)}</a>
<!--<![endif]--></td></tr></table>`;
}

const logoHeader = (appBase) => `<tr><td class="ec-pad" style="padding:26px 40px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;padding-right:11px;"><img src="${appBase}/email/logo-2x.png" width="36" height="36" alt="GroupPad" style="display:block;width:36px;height:36px;border-radius:10px;"/></td>
    <td style="vertical-align:middle;font-family:${DISPLAY};font-size:19px;font-weight:700;letter-spacing:-0.02em;color:${TEAL};">GroupPad</td>
  </tr></table></td></tr>`;

const eyebrow = (text, color = TEAL_EYE) => `<div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color};">${esc(text)}</div>`;
const h1 = (html) => `<h1 class="ec-ink" style="margin:10px 0 0;font-family:${DISPLAY};font-size:26px;line-height:1.18;font-weight:700;letter-spacing:-0.02em;color:${TEAL};">${html}</h1>`;
const rule = () => `<tr><td class="ec-pad" style="padding:26px 40px 0;"><div class="ec-rule" style="border-top:1px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
const footRow = (linesHtml) => `<tr><td class="ec-pad ec-foot" style="padding:18px 40px 30px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
  <p style="margin:0 0 4px;color:${MUTED};" class="ec-foot">GroupPad &middot; the calm way for groups to pick one rental.</p>
  ${linesHtml}</td></tr>`;
const link = (href, text) => `<a href="${href}" style="color:${TEAL_EYE};text-decoration:underline;">${esc(text)}</a>`;

// Shared frame: page bg → 600px card → [header] → body → rule → footer → © line.
function frame({ appBase = '', preheader = '', header, body, foot, outer = '&copy; 2026 GroupPad' }) {
  return `${HEAD}
<body class="ec-bg" style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ec-bg" style="background-color:${BG};"><tr><td align="center" style="padding:30px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="ec-card" style="width:600px;max-width:600px;background-color:${CARD};border:1px solid ${BORDER};border-radius:18px;overflow:hidden;">
${header == null ? logoHeader(appBase) : header}
${body}
${rule()}
${footRow(foot)}
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;"><tr><td align="center" style="padding:18px 12px 0;font-family:${SANS};font-size:11px;color:#9A8F7B;">${outer}</td></tr></table>
</td></tr></table></body></html>`;
}

// ── Builders ───────────────────────────────────────────────────────────────────
function magicLink({ appBase, link: href }) {
  const body = `<tr><td class="ec-pad" style="padding:28px 40px 0;">${eyebrow('Sign in')}${h1('Here’s your sign-in link')}</td></tr>
<tr><td class="ec-pad ec-ink" style="padding:16px 40px 0;font-family:${SANS};">
  <p class="ec-ink" style="margin:0 0 24px;font-size:16px;line-height:1.65;color:${INK};">Tap the button below to sign in to GroupPad. No password needed — this link signs you in on this device.</p>
  ${btn(href, 'Sign in to GroupPad', 230)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ec-chip" style="margin:24px 0 0;background-color:${CHIP};border:1px solid ${BORDER};border-radius:12px;"><tr>
    <td style="padding:13px 16px;font-family:${SANS};font-size:13.5px;line-height:1.55;color:${BODY};" class="ec-muted">This link works <strong style="color:${INK};">once</strong> and expires in <strong style="color:${INK};">15 minutes</strong>. If it expires, just request a new one from the sign-in screen.</td>
  </tr></table>
  <p class="ec-muted" style="margin:18px 0 0;font-size:13.5px;line-height:1.6;color:${MUTED};">Didn’t try to sign in? You can safely ignore this email — no one can access your account without this link.</p>
  <p class="ec-muted" style="margin:18px 0 0;font-size:12.5px;line-height:1.6;color:${MUTED};">If the button doesn’t work, copy and paste this URL:<br/><a href="${href}" style="color:${TEAL_EYE};text-decoration:underline;word-break:break-all;">${esc(href)}</a></p>
</td></tr>`;
  return frame({ appBase, preheader: 'Tap to sign in to GroupPad. This link works once and expires in 15 minutes.', body,
    foot: `<p style="margin:0;color:${MUTED};" class="ec-foot">This is a transactional security email about your account. ${link(`${appBase}/#/help`, 'Help center')}</p>` });
}

function invite({ appBase, tripName, destination, inviter, link: href, checkin, checkout, guests }) {
  const facts = [
    destination ? `\u{1F4CD}&nbsp;${esc(destination)}` : '',
    checkin && checkout ? `\u{1F5D3}&nbsp;${esc(checkin)} – ${esc(checkout)}` : '',
    guests ? `\u{1F465}&nbsp;${esc(guests)} guests` : '',
  ].filter(Boolean).map((f) => `<td class="ec-muted" style="font-family:${SANS};font-size:13.5px;color:${BODY};padding-right:16px;">${f}</td>`).join('');
  const body = `<tr><td class="ec-pad" style="padding:28px 40px 0;">${eyebrow('Trip invite')}${h1(`${esc(inviter)} invited you to help pick the place`)}</td></tr>
<tr><td class="ec-pad ec-ink" style="padding:14px 40px 0;font-family:${SANS};">
  <p class="ec-ink" style="margin:0 0 20px;font-size:16px;line-height:1.65;color:${INK};">You’re in on the <strong>${esc(tripName)}</strong>. Browse the rentals, thumbs-up the ones you like, and help the group lock one place everyone’s happy with.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ec-chip" style="margin:0 0 24px;background-color:${CHIP};border:1px solid ${BORDER};border-radius:14px;"><tr><td style="padding:18px 20px;">
    <div class="ec-ink" style="font-family:${DISPLAY};font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${TEAL};">${esc(tripName)}</div>
    ${facts ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:9px;"><tr>${facts}</tr></table>` : ''}
  </td></tr></table>
  ${btn(href, 'Join the trip', 200)}
  <p class="ec-muted" style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">Anyone with this link can view the board. You’ll sign in to vote or add homes — no password, just a one-tap link.</p>
</td></tr>`;
  return frame({ appBase, preheader: `${inviter} invited you to help pick the place for the ${tripName}.`, body,
    foot: `<p style="margin:0;color:${MUTED};" class="ec-foot">You received this because ${esc(inviter)} invited you to a trip. ${link(`${appBase}/#/help`, 'Help center')}</p>` });
}

function joined({ appBase, tripName, who, boardUrl, unsub, memberCount }) {
  const count = memberCount ? `that makes <strong>${esc(memberCount)} of you</strong> deciding together` : 'your group is coming together';
  const body = `<tr><td class="ec-pad" style="padding:28px 40px 0;" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td align="center" style="width:60px;height:60px;background-color:${TEAL_EYE};border-radius:30px;font-family:${DISPLAY};font-size:22px;font-weight:700;color:${BTN_FG};text-align:center;line-height:60px;">${esc(initials(who))}</td></tr></table>
    <div style="margin-top:16px;">${eyebrow('New member')}</div>
    <h1 class="ec-ink" style="margin:8px 0 0;font-family:${DISPLAY};font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${TEAL};">${esc(who)} joined the trip</h1>
  </td></tr>
  <tr><td class="ec-pad ec-ink" style="padding:14px 40px 0;font-family:${SANS};" align="center">
    <p class="ec-ink" style="margin:0 0 22px;font-size:16px;line-height:1.65;color:${INK};text-align:center;">${esc(who)} is now on the <strong>${esc(tripName)}</strong> — ${count}. The more votes in, the easier the pick.</p>
    ${btn(boardUrl, 'Open the board', 200)}
  </td></tr>`;
  return frame({ appBase, preheader: `${who} just joined the ${tripName}.`, body,
    foot: `${unsub ? `${link(`${appBase}/api/notify/unsubscribe?u=${unsub}`, 'Manage notifications')} &middot; ` : ''}<span style="color:${MUTED};" class="ec-foot">You’re the organizer, so we let you know when people join.</span>` });
}

function decisionLocked({ appBase, tripName, listingName, boardUrl, unsub, photo, area, specs, est5n, perPerson, organizer, votes }) {
  const banner = `<tr><td style="background-color:${TEAL};padding:34px 40px 30px;" align="center">
    <img src="${appBase}/email/seal-2x.png" width="76" height="76" alt="Official pick" style="display:block;width:76px;height:76px;margin:0 auto 16px;"/>
    <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${GOLD_EYE};">Official pick &middot; locked</div>
    <h1 style="margin:9px 0 0;font-family:${DISPLAY};font-size:28px;line-height:1.18;font-weight:800;letter-spacing:-0.02em;color:${CARD};">It’s official — you have a winner</h1>
    <p style="margin:9px 0 0;font-family:${SANS};font-size:14.5px;line-height:1.55;color:${TEAL_LIGHT};">The group picked the place for the ${esc(tripName)}.</p>
  </td></tr>`;
  const photoRow = photo ? `<tr><td class="ec-pad" style="padding:24px 40px 0;"><img src="${esc(photo)}" width="520" height="230" alt="${esc(listingName)}" style="display:block;width:100%;max-width:520px;height:auto;border-radius:14px;border:1px solid ${BORDER};"/></td></tr>` : '';
  const priceRow = est5n ? `<tr><td class="ec-pad" style="padding:18px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ec-row" style="background-color:${CHIP};border:1px solid ${BORDER};border-radius:14px;"><tr>
      <td style="padding:18px 20px;"><div class="ec-muted" style="font-family:${SANS};font-size:12px;color:${BODY};">Estimated all-in &middot; 5 nights</div><div class="ec-ink" style="font-family:${DISPLAY};font-size:24px;font-weight:700;color:${TEAL};margin-top:3px;">${esc(est5n)}</div></td>
      ${perPerson ? `<td align="right" style="padding:18px 20px;border-left:1px solid ${BORDER};"><div style="font-family:${SANS};font-size:12px;color:${GREEN};font-weight:700;">Your share</div><div style="font-family:${DISPLAY};font-size:24px;font-weight:700;color:${GREEN};margin-top:3px;">${esc(perPerson)}</div></td>` : ''}
    </tr></table></td></tr>` : '';
  const nameRow = `<tr><td class="ec-pad" style="padding:18px 40px 0;">
    <h2 class="ec-ink" style="margin:0;font-family:${DISPLAY};font-size:22px;line-height:1.2;font-weight:700;letter-spacing:-0.01em;color:${TEAL};">${esc(listingName)}</h2>
    ${area || specs ? `<p class="ec-muted" style="margin:7px 0 0;font-family:${SANS};font-size:14px;color:${BODY};">${[area, specs].filter(Boolean).map(esc).join(' &middot; ')}</p>` : ''}</td></tr>`;
  const note = `Locked${organizer ? ` by ${esc(organizer)}` : ''}${votes ? ` &middot; ${esc(votes)}` : ''}. Heads-up: GroupPad doesn’t book — open the listing to reserve, and verify the all-in total at checkout.`;
  const body = `${photoRow}${nameRow}${priceRow}
  <tr><td class="ec-pad" style="padding:22px 40px 0;" align="center">${btn(boardUrl, 'See the official pick', 240)}
    <p class="ec-muted" style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${note}</p>
  </td></tr>`;
  return frame({ appBase, preheader: `${listingName} is the pick for ${tripName}.`, header: banner, body,
    foot: `${unsub ? `${link(`${appBase}/api/notify/unsubscribe?u=${unsub}`, 'Manage preferences')} &middot; ` : ''}<span style="color:${MUTED};" class="ec-foot">You’re on the ${esc(tripName)}, so we let you know the decision was made.</span>`,
    outer: '&copy; 2026 GroupPad &middot; Prices are estimates — verify all-in totals at the booking step.' });
}

// Digest stat/list row — kept compatible with server's row builder, restyled.
function digestRow(headline, samples) {
  const sub = samples && samples.length
    ? `<ul style="margin:8px 0 0;padding-left:18px">${samples.map((s) => `<li style="margin:3px 0;color:${BODY};font-size:13px;font-family:${SANS};">${esc(s)}</li>`).join('')}</ul>`
    : '';
  return `<tr><td class="ec-row" style="padding:14px 16px;border:1px solid ${BORDER};border-radius:12px;background:${CARD};">
    <span style="font-size:15px;font-weight:600;color:${INK};font-family:${SANS};">${esc(headline)}</span>${sub}
  </td></tr><tr><td style="height:10px;line-height:10px">&nbsp;</td></tr>`;
}

function digest({ appBase, tripName, boardUrl, rowsHtml, unsub }) {
  const body = `<tr><td class="ec-pad" style="padding:28px 40px 0;">${eyebrow('Daily recap')}
    <h1 class="ec-ink" style="margin:10px 0 0;font-family:${DISPLAY};font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${TEAL};">${esc(tripName)}</h1>
    <p class="ec-muted" style="margin:7px 0 0;font-family:${SANS};font-size:14px;color:${BODY};">Here’s what your group got up to yesterday.</p></td></tr>
  <tr><td class="ec-pad" style="padding:18px 40px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml || ''}</table></td></tr>
  <tr><td class="ec-pad" style="padding:6px 40px 0;" align="center">${btn(boardUrl, 'Open the board', 200)}</td></tr>`;
  return frame({ appBase, preheader: `What your group did on ${tripName} in the last day.`, body,
    foot: `${unsub ? `${link(`${appBase}/api/notify/unsubscribe?u=${unsub}`, 'Manage preferences')} &middot; ` : ''}<span style="color:${MUTED};" class="ec-foot">Your daily recap for the ${esc(tripName)}.</span>` });
}

// Founder/welcome (new in the v2 suite; available for first-signup wiring).
function welcome({ appBase, name, link: href }) {
  const body = `<tr><td class="ec-pad" style="padding:28px 40px 0;">${eyebrow('Welcome')}${h1(`Welcome to GroupPad${name ? `, ${esc(name)}` : ''}`)}</td></tr>
  <tr><td class="ec-pad ec-ink" style="padding:16px 40px 0;font-family:${SANS};">
    <p class="ec-ink" style="margin:0 0 22px;font-size:16px;line-height:1.65;color:${INK};">GroupPad is the calm way for a group to pick one rental — add homes, vote in the open, see the real per-person cost, and lock the winner together.</p>
    ${btn(href || `${appBase}/#/trips`, 'Start a trip', 180)}
  </td></tr>`;
  return frame({ appBase, preheader: 'Welcome to GroupPad — the calm way to pick one rental, together.', body,
    foot: `<span style="color:${MUTED};" class="ec-foot">You’re receiving this because you just created a GroupPad account. ${link(`${appBase}/#/help`, 'Help center')}</span>` });
}

// Sent to a member the moment they're promoted to organizer.
function organizerAdded({ appBase, tripName, promotedBy, boardUrl, manageUrl, unsub }) {
  const can = [
    'Lock in the group’s official pick',
    'Invite people and manage the member list',
    'Approve must-haves and refresh the listings',
    'Promote other members to organizer',
  ].map((t) => `<tr><td style="padding:5px 0;font-family:${SANS};font-size:14.5px;line-height:1.5;color:${INK};" class="ec-ink"><span style="color:${TEAL_EYE};">&#10003;</span>&nbsp;&nbsp;${esc(t)}</td></tr>`).join('');
  const lead = promotedBy ? `${esc(promotedBy)} just made you an organizer of` : 'You’re now an organizer of';
  const body = `<tr><td class="ec-pad" style="padding:28px 40px 0;">${eyebrow('You’re now an organizer')}${h1(`You can help run the ${esc(tripName)}`)}</td></tr>
<tr><td class="ec-pad ec-ink" style="padding:14px 40px 0;font-family:${SANS};">
  <p class="ec-ink" style="margin:0 0 18px;font-size:16px;line-height:1.65;color:${INK};">${lead} <strong>${esc(tripName)}</strong>. You now have the same controls as every other organizer on the trip:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ec-chip" style="margin:0 0 24px;background-color:${CHIP};border:1px solid ${BORDER};border-radius:14px;"><tr><td style="padding:15px 20px;"><table role="presentation" cellpadding="0" cellspacing="0">${can}</table></td></tr></table>
  ${btn(manageUrl || boardUrl, 'Open the board', 200)}
  <p class="ec-muted" style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">Only the trip’s creator can delete the trip. Everything else is yours to manage.</p>
</td></tr>`;
  return frame({ appBase, preheader: `You’re now an organizer of the ${tripName}.`, body,
    foot: `${unsub ? `${link(`${appBase}/api/notify/unsubscribe?u=${unsub}`, 'Manage notifications')} &middot; ` : ''}<span style="color:${MUTED};" class="ec-foot">We let you know when your role on a trip changes.</span>` });
}

// Sent to the new creator when the creator role is handed over.
function creatorTransferred({ appBase, tripName, from, boardUrl, manageUrl, unsub }) {
  const lead = from ? `${esc(from)} handed you` : 'You’ve been handed';
  const body = `<tr><td class="ec-pad" style="padding:28px 40px 0;">${eyebrow('You’re the trip creator')}${h1(`The ${esc(tripName)} is yours to run`)}</td></tr>
<tr><td class="ec-pad ec-ink" style="padding:14px 40px 0;font-family:${SANS};">
  <p class="ec-ink" style="margin:0 0 22px;font-size:16px;line-height:1.65;color:${INK};">${lead} the <strong>${esc(tripName)}</strong>. As the creator you have full control, including trip settings and the option to delete the trip. The previous creator stays on as an organizer.</p>
  ${btn(manageUrl || boardUrl, 'Open trip settings', 220)}
</td></tr>`;
  return frame({ appBase, preheader: `You’re now the creator of the ${tripName}.`, body,
    foot: `${unsub ? `${link(`${appBase}/api/notify/unsubscribe?u=${unsub}`, 'Manage notifications')} &middot; ` : ''}<span style="color:${MUTED};" class="ec-foot">We let you know when your role on a trip changes.</span>` });
}

module.exports = { esc, frame, btn, digestRow, magicLink, invite, joined, decisionLocked, digest, welcome, organizerAdded, creatorTransferred, ACCENT };
