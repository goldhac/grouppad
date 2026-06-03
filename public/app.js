// ── Identity (passwordless accounts) ────────────────────────────────────────────
let USER      = null;   // { id, email, name } when signed in, else null
let DATA      = null;
let VOTES     = {};
let SUBMITTED = [];
let PIPELINE  = [];
let SPLIT     = 14;
let ADMIN_KEY = localStorage.getItem('admin_key') || null;
let ITINERARY = { text: '', updated_at: null };
let CAVEATS   = [];
let INSIGHTS  = null;
let SELECTED  = new Set();   // listing ids ticked for comparison
let FINAL     = { counts: {}, total: 0, myPick: null, decision: null };  // final-pick poll + official decision

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Auth actions (Google sign-in, with email magic-link as a fallback) ──────────
async function loadUser() {
  try { const d = await fetch('/api/auth/me').then(r => r.json()); USER = d.user || null; }
  catch { USER = null; }
}
// Primary: bounce to Google's OAuth flow (server handles the rest, then lands home).
function signInGoogle() { window.location.href = '/api/auth/google'; }

// ── Toast (non-blocking, replaces alert) ────────────────────────────────────────
function toast(msg, type = 'info', ms = 4200) {
  const stack = document.getElementById('toast-stack');
  if (!stack) { return; }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg').textContent = msg;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const kill = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  el.addEventListener('click', kill);
  setTimeout(kill, ms);
}

// ── Sign-in modal (replaces native prompt/confirm) ──────────────────────────────
function openAuthModal(reason) {
  const m = document.getElementById('auth-modal');
  if (!m) { signInGoogle(); return; }
  const sub = document.getElementById('auth-sub');
  if (sub) sub.textContent = reason
    ? `Sign in to ${reason}. Your votes and picks stay tied to you across devices.`
    : 'Sign in so your votes and picks are saved and tied to you across devices.';
  const msg = document.getElementById('auth-msg');
  if (msg) { msg.textContent = ''; msg.className = 'auth-msg'; }
  m.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => { const i = document.getElementById('auth-email-input'); if (i) i.focus(); }, 60);
}
function closeAuthModal() {
  const m = document.getElementById('auth-modal');
  if (m) m.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
// Send the passwordless magic-link from the modal's email field.
async function sendMagicLink() {
  const input = document.getElementById('auth-email-input');
  const msg = document.getElementById('auth-msg');
  const btn = document.getElementById('auth-email-send');
  const email = ((input && input.value) || '').trim();
  const setMsg = (t, cls) => { if (msg) { msg.textContent = t; msg.className = `auth-msg ${cls || ''}`; } };
  if (!EMAIL_RE.test(email)) { setMsg("That doesn't look like a valid email address.", 'err'); if (input) input.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const r = await fetch('/api/auth/request-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setMsg('Check your inbox — your sign-in link expires in 15 minutes.', 'ok');
      if (input) input.value = '';
    } else setMsg(d.error || 'Could not send the link. Try again.', 'err');
  } catch { setMsg('Network error — please try again.', 'err'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Email me a link'; } }
}
// Header / welcome "or use email" entry point — opens the modal.
function signInEmail() { openAuthModal(); }
// Default sign-in action used across the UI.
function signIn() { openAuthModal(); }
async function signOut() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  USER = null; render();
  toast('Signed out.', 'info');
}
async function renameUser() {
  if (!USER) return;
  const name = (prompt('Display name:', USER.name) || '').trim();
  if (!name || name === USER.name) return;
  try {
    const r = await fetch('/api/auth/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { USER = d.user; render(); toast('Name updated.', 'success'); }
    else toast(d.error || 'Could not update name.', 'error');
  } catch { toast('Network error.', 'error'); }
}
// Gate an action behind sign-in; opens the sign-in modal if signed out.
function requireSignIn(action) {
  if (USER) return true;
  openAuthModal(action);
  return false;
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  const [me, data, votes, submitted, pipeline, itinerary, caveats, insights, final] = await Promise.all([
    fetch('/api/auth/me').then(r => r.json()).catch(() => ({ user: null })),
    fetch('/api/listings').then(r => r.json()),
    fetch('/api/votes').then(r => r.json()).catch(() => ({})),
    fetch('/api/submitted').then(r => r.json()).catch(() => []),
    fetch('/api/pipeline-listings').then(r => r.json()).catch(() => ({ listings: [] })),
    fetch('/api/itinerary').then(r => r.json()).catch(() => ({ text: '', updated_at: null })),
    fetch('/api/caveats').then(r => r.json()).catch(() => []),
    fetch('/api/insights').then(r => r.json()).catch(() => null),
    fetch('/api/final').then(r => r.json()).catch(() => ({ counts: {}, total: 0, myPick: null, decision: null })),
  ]);
  USER      = (me && me.user) || null;
  DATA      = data;
  VOTES     = votes;
  SUBMITTED = submitted;
  PIPELINE  = pipeline.listings || [];
  ITINERARY = itinerary || { text: '', updated_at: null };
  CAVEATS   = Array.isArray(caveats) ? caveats : [];
  INSIGHTS  = insights && insights.analysis ? insights : null;
  FINAL     = final && final.counts ? final : { counts: {}, total: 0, myPick: null, decision: null };
}

// Resolve a listing id to its full object across every pool (base/pipeline/submitted).
function findListingById(id) {
  const all = [...SUBMITTED, ...PIPELINE, ...(DATA && DATA.listings || [])];
  return all.find(x => String(x.id) === String(id)) || null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return n == null ? '—' : '$' + n.toLocaleString(); }

function amenity(key, val) {
  if (val === 'yes') return `<span class="amenity yes">✓ ${key}</span>`;
  if (val === 'no')  return `<span class="amenity no">✗ ${key}</span>`;
  return `<span class="amenity unknown">? ${key}</span>`;
}

function tallyVotes(listingId) {
  const v = VOTES[listingId] || {};
  let up = 0, down = 0, mine = null;
  for (const [voter, vote] of Object.entries(v)) {
    if (vote === 'up') up++;
    else if (vote === 'down') down++;
    if (USER && voter === USER.id) mine = vote;
  }
  return { up, down, mine };
}

function netVotes(listingId) {
  const { up, down } = tallyVotes(listingId);
  return up - down;
}

// ── Final pick (top-choice poll + admin-locked official decision) ───────────────
function finalCount(listingId) { return (FINAL.counts && FINAL.counts[String(listingId)]) || 0; }
function isMyPick(listingId)   { return String(FINAL.myPick) === String(listingId); }
function isDecision(listingId) { return !!(FINAL.decision && String(FINAL.decision.listing_id) === String(listingId)); }
function decisionLocked()      { return !!(FINAL.decision && FINAL.decision.listing_id); }

// Toggle this listing as my single top choice (clears if already mine).
async function toggleFinalPick(listingId) {
  if (!requireSignIn('pick a favorite')) return;
  const next = isMyPick(listingId) ? null : String(listingId);
  try {
    const res = await fetch('/api/final-vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: next }),
    });
    if (res.ok) { FINAL = await res.json(); render(); }
    else if (res.status === 401) { USER = null; requireSignIn('pick a favorite'); }
  } catch { /* ignore network blips */ }
}

// Admin: lock this listing as the official decision (or unlock by passing null).
async function setDecision(listingId) {
  if (!ADMIN_KEY) { alert('Log in as admin first.'); return; }
  try {
    const res = await fetch('/api/admin/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify({ listing_id: listingId == null ? null : String(listingId) }),
    });
    const data = await res.json();
    if (res.ok) { FINAL = { ...FINAL, decision: data.decision }; render(); }
    else alert(data.error || 'Could not update the decision.');
  } catch { alert('Network error — try again.'); }
}

// Prioritize mansions / large homes for LA search ordering
function mansionScore(l) {
  const t = (l.name || '').toLowerCase();
  let s = (l.bd || 0) * 2 + (l.sleeps || 0) * 0.3;
  if (/mansion|estate|villa|manor|chateau|grand|luxur/.test(t)) s += 8;
  return s;
}

// Minimal, safe markdown → HTML (bold, headings, lists, pipe tables)
function mdToHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = md.split('\n');
  let html = '', i = 0, listType = null;
  const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
  while (i < lines.length) {
    const line = lines[i];
    // table block
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      closeList();
      const head = line.split('|').slice(1, -1).map(c => `<th>${inline(c.trim())}</th>`).join('');
      html += `<table class="cmp-table"><thead><tr>${head}</tr></thead><tbody>`;
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].split('|').slice(1, -1).map(c => `<td>${inline(c.trim())}</td>`).join('');
        html += `<tr>${cells}</tr>`; i++;
      }
      html += '</tbody></table>';
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { closeList(); const lv = Math.min(m[1].length + 2, 6); html += `<h${lv}>${inline(m[2])}</h${lv}>`; }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/)))  { if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if (line.trim() === '') { closeList(); }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
    i++;
  }
  closeList();
  return html;
}

let SHORTLIST_IDS = new Set();

// ── Carousel ──────────────────────────────────────────────────────────────────
function renderCarousel(listing) {
  const photos = listing.photos || [];
  if (!photos.length) {
    return `<div class="carousel"><div class="carousel-slide placeholder">no image</div></div>`;
  }
  const slides = photos.map(p =>
    `<div class="carousel-slide"><img loading="lazy" src="${p}" alt=""></div>`
  ).join('');
  const dots = photos.map((_, i) =>
    `<span class="dot${i === 0 ? ' active' : ''}" data-i="${i}"></span>`
  ).join('');
  return `
    <div class="carousel" data-idx="0" data-len="${photos.length}">
      <div class="carousel-track" style="transform:translateX(0%)">${slides}</div>
      ${photos.length > 1 ? `
        <button class="carousel-btn prev" aria-label="Previous">‹</button>
        <button class="carousel-btn next" aria-label="Next">›</button>
        <div class="carousel-dots">${dots}</div>
      ` : ''}
    </div>
  `;
}

// ── Per-person split row ──────────────────────────────────────────────────────
function renderPerPerson(est5n, budget = 7000) {
  if (!est5n) return '';
  const pp     = Math.ceil(est5n / SPLIT);
  const isOver = est5n > budget;
  return `
    <div class="per-person-row${isOver ? ' over' : ''}">
      <span class="per-person-amount">${fmt(pp)}</span>
      <span class="per-person-label">per person · split ${SPLIT} ways</span>
    </div>
  `;
}

// ── Card ──────────────────────────────────────────────────────────────────────
function renderCard(l, isSubmitted, isPipeline = false) {
  const overBudget = l.budget === 'over';
  const cls = [
    'card',
    overBudget      ? 'over-budget'  : '',
    l.check_manual  ? 'check-manual' : '',
    isSubmitted     ? 'submitted'    : '',
    isPipeline      ? 'pipeline-card': '',
    SELECTED.has(String(l.id)) ? 'is-selected' : '',
    isDecision(l.id) ? 'is-decision' : '',
  ].filter(Boolean).join(' ');

  const budgetBadge = l.budget === 'under'    ? '<span class="badge under">under budget</span>'
    : l.budget === 'over'    ? '<span class="badge over">over budget</span>'
    : l.budget === 'marginal' ? '<span class="badge marginal">marginal</span>'
    : '<span class="badge unknown">unknown</span>';

  const rankBadge = isPipeline
    ? `<span class="pipeline-live-tag">live</span>`
    : isSubmitted
      ? `<span class="submitted-tag">community submission</span>`
      : l.rank <= 3
        ? `<span class="rank top">★ Rank ${l.rank}</span>`
        : `<span class="rank">Rank ${l.rank}</span>`;

  const specs = [
    l.bd     != null ? `<span>${l.bd} bd</span>`       : '',
    l.ba     != null ? `<span>${l.ba} ba</span>`       : '',
    l.sleeps != null ? `<span>sleeps ${l.sleeps}</span>` : '',
  ].filter(Boolean).join('');

  const reviews = l.rating != null
    ? `<div class="reviews"><strong>${l.rating}★</strong> (${l.reviews ?? '?'} reviews)${l.superhost ? ' · Superhost' : ''}</div>`
    : (l.reviews ? `<div class="reviews">(${l.reviews} reviews)</div>` : '<div class="reviews">no rating yet</div>');

  const distance = l.distance_mi
    ? `<span class="distance">📍 ${l.distance_mi} mi from DTLA</span>` : '';

  // Highlight badges (Guest favorite, Superhost, etc.) for a quick glimpse
  const highlightChips = Array.isArray(l.amenities)
    ? l.amenities
        .filter(a => /guest favorite|superhost|washer|dryer/i.test(a))
        .slice(0, 3)
        .map(a => `<span class="amenity hi">★ ${a}</span>`)
        .join('')
    : '';

  const submittedBy = isSubmitted
    ? `<div class="submitted-by-line">Submitted by ${l.submitted_by} · ${l.submitted_at}</div>` : '';

  const adminDeleteBtn = ADMIN_KEY && !isPipeline
    ? `<button class="delete-btn" data-id="${l.id}" data-submitted="${isSubmitted ? '1' : '0'}" title="Delete listing">✕ Delete</button>`
    : '';

  const { up, down, mine } = tallyVotes(l.id);

  const fCount  = finalCount(l.id);
  const finalBtn = `<button class="final-btn ${isMyPick(l.id) ? 'mine' : ''}" data-final="${l.id}" title="Mark as your one top choice">
      <span>⭐</span><span class="final-label">${isMyPick(l.id) ? 'My pick' : 'Top choice'}</span>${fCount ? `<span class="count">${fCount}</span>` : ''}
    </button>`;
  const officialBtn = ADMIN_KEY
    ? `<button class="official-btn ${isDecision(l.id) ? 'active' : ''}" data-official="${l.id}" title="${isDecision(l.id) ? 'Unlock the official pick' : 'Lock this as the official pick'}">${isDecision(l.id) ? '🔓 Unlock' : '📌 Make official'}</button>`
    : '';
  const decisionRibbon = isDecision(l.id) ? `<div class="decision-ribbon">✅ Official pick</div>` : '';

  return `
    <div class="${cls}" data-id="${l.id}">
      ${decisionRibbon}
      ${renderCarousel(l)}
      <div class="card-body">
        <div class="rank-row">
          ${rankBadge}
          <span class="source">${l.source}</span>
          <label class="select-box" title="Tick to compare"><input type="checkbox" class="select-cb" data-id="${l.id}" ${SELECTED.has(String(l.id)) ? 'checked' : ''}><span>compare</span></label>
          ${adminDeleteBtn}
        </div>
        <h2 class="name">${l.name}</h2>
        <div class="location-row">
          <span class="area">${l.area}</span>${distance}
        </div>
        ${submittedBy}
        <div class="specs">${specs}</div>
        <div class="amenities">${amenity('pool', l.pool)}${l.hot_tub === 'yes' ? amenity('hot tub', l.hot_tub) : ''}${amenity('parking', l.parking)}${highlightChips}</div>
        ${reviews}
        <div class="price-row">
          <span class="price">${fmt(l.est_5n)}</span>
          ${budgetBadge}
        </div>
        <div class="price-sub">${l.displayed_5n
          ? `displayed: ${fmt(l.displayed_5n)} for 5 nights · 4-night est: ${fmt(l.est_4n)}`
          : 'price on inquiry'}</div>
        ${renderPerPerson(l.est_5n, DATA ? DATA.trip.budget : 7000)}
        ${l.note ? `<div class="note">${l.note}</div>` : ''}
        <div class="actions">
          <a class="book" href="${l.url}" target="_blank" rel="noopener">
            ${l.check_manual ? 'Check manually →' : 'View on ' + l.source + ' →'}
          </a>
          <div class="vote-bar">
            <button class="vote-btn up ${mine === 'up' ? 'mine' : ''}" data-vote="up" title="Upvote">
              <span>👍</span><span class="count">${up}</span>
            </button>
            <button class="vote-btn down ${mine === 'down' ? 'mine' : ''}" data-vote="down" title="Downvote">
              <span>👎</span><span class="count">${down}</span>
            </button>
          </div>
        </div>
        <div class="final-row">
          ${finalBtn}
          ${officialBtn}
        </div>
      </div>
    </div>
  `;
}

// ── Split display ─────────────────────────────────────────────────────────────
function updateSplitDisplay() {
  const el = document.getElementById('split-display');
  if (!el || !DATA) return;
  const under = DATA.listings.filter(l => l.budget === 'under' || l.budget === 'marginal');
  if (under.length && under[0].est_5n) {
    const pp = Math.ceil(under[0].est_5n / SPLIT);
    el.innerHTML = `${SPLIT} people · <strong>~${fmt(pp)}/ea</strong> <span style="color:var(--muted);font-size:11px">(top pick)</span>`;
  } else {
    el.textContent = `${SPLIT} people`;
  }
}

// ── Admin UI ──────────────────────────────────────────────────────────────────
function updateAdminButton() {
  const btn = document.getElementById('admin-btn');
  if (!btn) return;
  if (ADMIN_KEY) {
    btn.textContent = '🔓 Admin';
    btn.classList.add('admin-active');
  } else {
    btn.textContent = '🔑 Admin';
    btn.classList.remove('admin-active');
  }
}

async function toggleAdmin() {
  if (ADMIN_KEY) {
    // Log out
    ADMIN_KEY = null;
    localStorage.removeItem('admin_key');
    updateAdminButton();
    render();
    return;
  }
  const key = prompt('Enter admin key:');
  if (!key) return;
  try {
    const res = await fetch('/api/admin/verify', { headers: { 'x-admin-key': key } });
    if (res.ok) {
      ADMIN_KEY = key;
      localStorage.setItem('admin_key', key);
      updateAdminButton();
      render();
    } else {
      alert('Wrong admin key.');
    }
  } catch {
    alert('Could not verify — check connection.');
  }
}

async function triggerPipeline() {
  if (!ADMIN_KEY) { alert('Log in as admin first.'); return; }
  if (!confirm('Run the pipeline now?\n\nThis will pull fresh listings from VRBO & Airbnb. Takes ~2–3 minutes.')) return;
  try {
    const res = await fetch('/api/admin/run-pipeline', { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } });
    const data = await res.json();
    if (res.ok) alert('Pipeline started! Refresh in a few minutes to see new listings.');
    else alert('Error: ' + (data.error || res.status));
  } catch {
    alert('Network error — check connection.');
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (!DATA) return;
  const t = DATA.trip;

  document.getElementById('trip-line').textContent =
    `${t.checkin} → ${t.checkout_5n} (5 nights) · ${t.adults} guests · budget $${t.budget.toLocaleString()} all-in`;

  const wt = document.getElementById('welcome-trip');
  if (wt) wt.textContent =
    `${t.checkin} → ${t.checkout_5n} · ${t.adults} guests · $${t.budget.toLocaleString()} all-in budget · ${DATA.listings.length} homes to browse`;
  updateNav();

  const listings   = DATA.listings;
  const underCount = listings.filter(l => l.budget === 'under').length;

  const authSpan = USER
    ? `<span class="auth-state"><strong>Signed in:</strong> ${escapeHtml(USER.name)} ` +
      `<a href="#" id="auth-rename" style="color:var(--link)">rename</a> · ` +
      `<a href="#" id="auth-signout" style="color:var(--link)">sign out</a></span>`
    : `<span class="auth-state"><a href="#" id="auth-signin" style="color:var(--link)"><strong>Sign in with Google to vote →</strong></a> ` +
      `<a href="#" id="auth-signin-email" style="color:var(--muted);font-size:.85em">or use email</a></span>`;

  document.getElementById('params-line').innerHTML =
    `<span><strong>Sites:</strong> VRBO · Airbnb · Booking.com</span>` +
    `<span><strong>Listings:</strong> ${listings.length}</span>` +
    `<span><strong>Under budget:</strong> ${underCount}</span>` +
    `<span><strong>Refreshed:</strong> ${t.refreshed_at}</span>` +
    authSpan;

  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = (e) => { e.preventDefault(); fn(); }; };
  bind('auth-signin', signInGoogle);
  bind('auth-signin-email', signInEmail);
  bind('auth-rename', renameUser);
  bind('auth-signout', signOut);

  const onlyUnder  = document.getElementById('f-under').checked;
  const needPool   = document.getElementById('f-pool').checked;
  const needPark   = document.getElementById('f-parking').checked;
  const showManual = document.getElementById('f-manual').checked;

  // Official decision banner / top-choice leaderboard.
  renderDecision();

  // Compute the shortlist: member-added homes + anything liked (net upvotes ≥ 1).
  renderShortlist();

  const filtered = listings.filter(l => {
    if (SHORTLIST_IDS.has(String(l.id)))   return false; // moved up to shortlist
    if (onlyUnder  && l.budget !== 'under' && l.budget !== 'marginal') return false;
    if (needPool   && l.pool    !== 'yes') return false;
    if (needPark   && l.parking !== 'yes') return false;
    if (!showManual && l.check_manual)     return false;
    return true;
  });

  document.getElementById('count').textContent = `${filtered.length} of ${listings.length} listings`;
  document.getElementById('grid').innerHTML = filtered.length
    ? filtered.map(l => renderCard(l, false)).join('')
    : '<div style="grid-column:1/-1;color:var(--muted);padding:40px 0;text-align:center;">No listings match these filters.</div>';

  renderSubmitted();
  renderPipeline();
  renderItinerary();
  renderCaveats();
  renderInsights();
  updateSplitDisplay();
  attachCardHandlers();
}

// Show the single admin-posted itinerary; prefill the admin editor.
// The text is collapsed behind a toggle button so it doesn't crowd the page.
function renderItinerary() {
  const disp = document.getElementById('itinerary-display');
  if (disp) {
    disp.textContent = ITINERARY.text ? ITINERARY.text : 'No itinerary posted yet.';
    disp.classList.toggle('empty', !ITINERARY.text);
  }
  const edit = document.getElementById('itinerary-edit');
  if (edit && document.activeElement !== edit) edit.value = ITINERARY.text || '';
  const itAdmin = document.getElementById('itinerary-admin');
  if (itAdmin) itAdmin.classList.toggle('hidden', !ADMIN_KEY);
  // Toggle button label reflects whether anything is posted.
  const tog = document.getElementById('itinerary-toggle');
  if (tog) tog.textContent = (disp && !disp.classList.contains('hidden'))
    ? '📋 Hide itinerary'
    : (ITINERARY.text ? '📋 View itinerary' : '📋 No itinerary yet');
}

// Wire the collapse/expand toggle once.
(function wireItineraryToggle() {
  const tog = document.getElementById('itinerary-toggle');
  const disp = document.getElementById('itinerary-display');
  if (!tog || !disp) return;
  tog.addEventListener('click', () => {
    const nowHidden = disp.classList.toggle('hidden');
    tog.setAttribute('aria-expanded', String(!nowHidden));
    tog.textContent = nowHidden
      ? (ITINERARY.text ? '📋 View itinerary' : '📋 No itinerary yet')
      : '📋 Hide itinerary';
  });
})();

// Group caveats chat log + admin delete.
function renderCaveats() {
  const list = document.getElementById('caveats-list');
  if (!list) return;
  if (!CAVEATS.length) {
    list.innerHTML = '<div class="caveat-empty">No caveats yet — be the first to add one.</div>';
    return;
  }
  list.innerHTML = CAVEATS.slice().reverse().map(c => `
    <div class="caveat-item">
      <span class="caveat-who">${escapeHtml(c.name)}</span>
      <span class="caveat-body">${escapeHtml(c.text)}</span>
      ${ADMIN_KEY ? `<button class="caveat-del" data-id="${c.id}" title="Delete">✕</button>` : ''}
    </div>`).join('');
  list.querySelectorAll('.caveat-del').forEach(btn => {
    btn.onclick = async () => {
      const res = await fetch(`/api/caveats/${btn.dataset.id}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } });
      if (res.ok) { CAVEATS = await res.json(); renderCaveats(); }
    };
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Cached AI shortlist analysis, shown to everyone (one Gemini call serves all).
function renderInsights() {
  const block = document.getElementById('insights-block');
  const body  = document.getElementById('insights-body');
  const when  = document.getElementById('insights-when');
  if (!block || !body) return;
  if (!INSIGHTS || !INSIGHTS.analysis) { block.classList.add('hidden'); return; }
  block.classList.remove('hidden');
  // Stale check: compare the shortlist these insights were built from against
  // the current shortlist. If it changed, prompt a re-run.
  const stale = Array.isArray(INSIGHTS.ids)
    && JSON.stringify(INSIGHTS.ids.slice().sort()) !== JSON.stringify([...SHORTLIST_IDS].sort());
  const staleNote = stale
    ? `<div class="insights-stale">⚠️ The shortlist changed since this analysis — re-run “Analyze &amp; compare” for fresh insights.</div>`
    : '';
  body.innerHTML = staleNote + mdToHtml(INSIGHTS.analysis);
  if (when && INSIGHTS.created_at) {
    const d = new Date(INSIGHTS.created_at);
    when.textContent = `updated ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

// Reflect the current card selection in the compare controls.
function updateSelectionUI() {
  const n = SELECTED.size;
  const txt = `${n} selected`;
  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  // Inline controls inside the compare panel
  set('select-count', el => el.textContent = txt);
  set('cmp-1v1',     el => el.disabled = n !== 2);
  set('cmp-selected',el => el.disabled = n < 2);
  set('cmp-clear',   el => el.disabled = n === 0);
  // Floating dock (so you can compare without scrolling up)
  set('dock-count',    el => el.textContent = txt);
  set('dock-1v1',      el => el.disabled = n !== 2);
  set('dock-selected', el => el.disabled = n < 2);
  set('compare-dock',  el => el.classList.toggle('hidden', n < 1));
}

// Resolve selected ids to full listing objects from every pool.
function getSelectedListings() {
  const all = [...SUBMITTED, ...PIPELINE, ...(DATA && DATA.listings || [])];
  const out = [], seen = new Set();
  for (const id of SELECTED) {
    const l = all.find(x => String(x.id) === String(id));
    if (l && !seen.has(String(id))) { seen.add(String(id)); out.push(l); }
  }
  return out;
}

// Final-pick banner: shows the admin's official locked pick, or — if none is
// locked yet — a live "top choice" leaderboard tallied from members' single picks.
function renderDecision() {
  const sec = document.getElementById('decision-section');
  if (!sec) return;

  // 1) Official, admin-locked decision wins the banner.
  if (decisionLocked()) {
    const l = findListingById(FINAL.decision.listing_id);
    const when = FINAL.decision.locked_at ? new Date(FINAL.decision.locked_at) : null;
    const whenStr = when ? `${when.toLocaleDateString()}` : '';
    const name = l ? escapeHtml(l.name) : 'the chosen home';
    const sub  = l ? `${escapeHtml(l.area || '')}${l.est_5n ? ' · ' + fmt(l.est_5n) + ' for 5 nights · ' + fmt(Math.ceil(l.est_5n / SPLIT)) + '/person' : ''}` : '';
    const link = l ? `<a class="decision-link" href="${l.url}" target="_blank" rel="noopener">View on ${escapeHtml(l.source || 'site')} →</a>` : '';
    const viewBtn = l ? `<button class="decision-view" data-detail="${l.id}">See details</button>` : '';
    const adminUnlock = ADMIN_KEY ? `<button class="decision-unlock" id="decision-unlock">🔓 Unlock</button>` : '';
    sec.className = 'decision-section locked';
    sec.innerHTML = `
      <div class="decision-flag">✅ It's official — we're booking this one${whenStr ? ` · locked ${whenStr}` : ''}</div>
      <div class="decision-name">${name}</div>
      ${sub ? `<div class="decision-sub">${sub}</div>` : ''}
      <div class="decision-actions">${viewBtn}${link}${adminUnlock}</div>
    `;
    const ub = document.getElementById('decision-unlock');
    if (ub) ub.onclick = () => { if (confirm('Unlock the official pick? This reopens the decision.')) setDecision(null); };
    const vb = sec.querySelector('.decision-view');
    if (vb) vb.onclick = () => openDetail(vb.dataset.detail);
    return;
  }

  // 2) No official pick yet — show the top-choice leaderboard if anyone has voted.
  const entries = Object.entries(FINAL.counts || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!entries.length) { sec.className = 'decision-section hidden'; sec.innerHTML = ''; return; }

  const rows = entries.map(([id, n]) => {
    const l = findListingById(id);
    const label = l ? escapeHtml(l.name) : `Listing ${escapeHtml(id)}`;
    const pct = FINAL.total ? Math.round((n / FINAL.total) * 100) : 0;
    const mine = isMyPick(id) ? '<span class="lead-mine">your pick</span>' : '';
    return `
      <button class="lead-row" data-detail="${escapeHtml(String(id))}">
        <span class="lead-bar" style="width:${pct}%"></span>
        <span class="lead-name">${label} ${mine}</span>
        <span class="lead-count">${n} ${n === 1 ? 'pick' : 'picks'}</span>
      </button>`;
  }).join('');

  sec.className = 'decision-section poll';
  sec.innerHTML = `
    <div class="decision-flag">🏆 Top choices so far <span class="decision-total">${FINAL.total} member${FINAL.total === 1 ? '' : 's'} voted</span></div>
    <div class="lead-list">${rows}</div>
    <div class="decision-hint">Tap ⭐ <strong>Top choice</strong> on any home to cast your single pick.${ADMIN_KEY ? ' Admins can “📌 Make official” to lock the final decision.' : ''}</div>
  `;
  sec.querySelectorAll('.lead-row').forEach(b => { b.onclick = () => openDetail(b.dataset.detail); });
}

// The members' shortlist: anything liked (net upvotes ≥ 1), ranked by votes.
// Community submissions live in their own section below and only rise into the
// shortlist once they get a net upvote — so a freshly-added home is never lost.
function renderShortlist() {
  const section = document.getElementById('shortlist-section');
  const grid    = document.getElementById('shortlist-grid');
  if (!section || !grid) return;

  const base     = (DATA && DATA.listings || []).map(l => ({ l, submitted: false, pipeline: false }));
  const pipeline = PIPELINE.map(l => ({ l, submitted: false, pipeline: true }));
  const subs     = SUBMITTED.map(l => ({ l, submitted: true,  pipeline: false }));

  const seen = new Set();
  const items = [];
  for (const it of [...subs, ...pipeline, ...base]) {
    const id = String(it.l.id);
    if (seen.has(id)) continue;
    if (netVotes(id) >= 1) { seen.add(id); items.push(it); }
  }

  SHORTLIST_IDS = new Set(items.map(it => String(it.l.id)));

  if (!items.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  items.sort((a, b) => (netVotes(String(b.l.id)) - netVotes(String(a.l.id))) || (mansionScore(b.l) - mansionScore(a.l)));
  grid.innerHTML = items.map(it => renderCard(it.l, it.submitted, it.pipeline)).join('');
}

// Member-added homes. Always visible (minus any already promoted to the
// shortlist by votes), so submissions never disappear on refresh.
function renderSubmitted() {
  const section = document.getElementById('submitted-section');
  const grid    = document.getElementById('submitted-grid');
  if (!section || !grid) return;

  const items = SUBMITTED.filter(l => !SHORTLIST_IDS.has(String(l.id)));
  if (!items.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  items.sort((a, b) => (netVotes(String(b.id)) - netVotes(String(a.id))) || (mansionScore(b) - mansionScore(a)));
  grid.innerHTML = items.map(l => renderCard(l, true, false)).join('');
}

function renderPipeline() {
  const section = document.getElementById('pipeline-section');
  const grid    = document.getElementById('pipeline-grid');
  if (!section || !grid) return;

  const onlyUnder = document.getElementById('f-under').checked;
  const needPool  = document.getElementById('f-pool').checked;
  const needPark  = document.getElementById('f-parking').checked;

  const filtered = PIPELINE.filter(l => {
    if (SHORTLIST_IDS.has(String(l.id))) return false; // shown in shortlist instead
    if (onlyUnder && l.budget !== 'under' && l.budget !== 'marginal') return false;
    if (needPool  && l.pool    !== 'yes') return false;
    if (needPark  && l.parking !== 'yes') return false;
    return true;
  });
  // Prioritize mansions / large homes
  filtered.sort((a, b) => mansionScore(b) - mansionScore(a));

  if (!PIPELINE.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  // Update header count
  const noteEl = section.querySelector('.pipeline-note');
  if (noteEl) noteEl.textContent =
    `Pulled from VRBO & Airbnb · big homes first · ${filtered.length} of ${PIPELINE.length} shown`;

  grid.innerHTML = filtered.length
    ? filtered.map(l => renderCard(l, false, true)).join('')
    : '<div style="grid-column:1/-1;color:var(--muted);padding:20px 0;text-align:center;">No pipeline listings match these filters.</div>';
}

// ── Card handlers ─────────────────────────────────────────────────────────────
function attachCardHandlers() {
  // Carousel
  document.querySelectorAll('.carousel').forEach(carousel => {
    const track = carousel.querySelector('.carousel-track');
    const dots  = carousel.querySelectorAll('.dot');
    const len   = +carousel.dataset.len;
    const go    = (i) => {
      const idx = (i + len) % len;
      carousel.dataset.idx = idx;
      track.style.transform = `translateX(-${idx * 100}%)`;
      dots.forEach((d, j) => d.classList.toggle('active', j === idx));
    };
    const prev = carousel.querySelector('.carousel-btn.prev');
    const next = carousel.querySelector('.carousel-btn.next');
    if (prev) prev.onclick = (e) => { e.stopPropagation(); go(+carousel.dataset.idx - 1); };
    if (next) next.onclick = (e) => { e.stopPropagation(); go(+carousel.dataset.idx + 1); };
    dots.forEach(d => d.onclick = (e) => { e.stopPropagation(); go(+d.dataset.i); });
  });

  // Selection checkboxes (for comparison)
  document.querySelectorAll('.select-cb').forEach(cb => {
    cb.onclick = (e) => {
      e.stopPropagation();
      const id = String(cb.dataset.id);
      if (cb.checked) SELECTED.add(id); else SELECTED.delete(id);
      const card = cb.closest('.card');
      if (card) card.classList.toggle('is-selected', cb.checked);
      updateSelectionUI();
    };
  });
  updateSelectionUI();

  // Voting
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!requireSignIn('vote')) return;
      const card      = btn.closest('.card');
      const listingId = card.dataset.id;
      const myVote    = btn.dataset.vote;
      const current   = (VOTES[listingId] || {})[USER.id];
      const next      = current === myVote ? null : myVote;
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, vote: next }),
      });
      if (res.ok) { VOTES = await res.json(); render(); }
      else if (res.status === 401) { USER = null; requireSignIn('vote'); }
    };
  });

  // Final pick (member's single top choice)
  document.querySelectorAll('.final-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); toggleFinalPick(btn.dataset.final); };
  });

  // Admin: lock/unlock the official decision
  document.querySelectorAll('.official-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.official;
      if (isDecision(id)) { if (confirm('Unlock the official pick? This reopens the decision.')) setDecision(null); }
      else { if (confirm('Lock this as the group’s official pick? Everyone will see it at the top.')) setDecision(id); }
    };
  });

  // Open the detail view when the card body (not an inner control) is clicked.
  document.querySelectorAll('.card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      // Let links (the "book" button) and form controls behave normally.
      if (e.target.closest('a, button, input, label')) return;
      openDetail(card.dataset.id);
    });
  });

  // Admin delete
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id          = btn.dataset.id;
      const isSubmitted = btn.dataset.submitted === '1';
      const name        = btn.closest('.card').querySelector('.name')?.textContent || id;
      if (!confirm(`Delete "${name}"?\n\nThis removes it from the site immediately.`)) return;

      btn.disabled   = true;
      btn.textContent = '…';

      const endpoint = isSubmitted ? `/api/submitted/${id}` : `/api/listings/${id}`;
      const res = await fetch(endpoint, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } });

      if (res.ok) {
        if (isSubmitted) {
          SUBMITTED = SUBMITTED.filter(l => String(l.id) !== String(id));
        } else {
          DATA.listings = DATA.listings.filter(l => String(l.id) !== String(id));
        }
        render();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Delete failed: ${err.error || res.status}`);
        btn.disabled   = false;
        btn.textContent = '✕ Delete';
      }
    };
  });
}

// ── Listing detail modal ────────────────────────────────────────────────────────
let DETAIL_ID = null;

function detailGallery(l) {
  const photos = l.photos || [];
  if (!photos.length) return `<div class="detail-photo placeholder">no image</div>`;
  const main = `<div class="detail-photo"><img id="detail-main-img" loading="lazy" src="${photos[0]}" alt=""></div>`;
  const thumbs = photos.length > 1
    ? `<div class="detail-thumbs">${photos.map((p, i) =>
        `<img class="detail-thumb${i === 0 ? ' active' : ''}" data-src="${p}" loading="lazy" src="${p}" alt="">`).join('')}</div>`
    : '';
  return main + thumbs;
}

function renderDetail(l) {
  const { up, down, mine } = tallyVotes(l.id);
  const specs = [
    l.bd     != null ? `<span>${l.bd} bd</span>` : '',
    l.ba     != null ? `<span>${l.ba} ba</span>` : '',
    l.sleeps != null ? `<span>sleeps ${l.sleeps}</span>` : '',
  ].filter(Boolean).join('');

  const reviews = l.rating != null
    ? `<div class="reviews"><strong>${l.rating}★</strong> (${l.reviews ?? '?'} reviews)${l.superhost ? ' · Superhost' : ''}</div>`
    : (l.reviews ? `<div class="reviews">(${l.reviews} reviews)</div>` : '<div class="reviews">no rating yet</div>');

  const amenities = Array.isArray(l.amenities) && l.amenities.length
    ? `<div class="detail-amenities">${l.amenities.map(a => `<span class="amenity">${escapeHtml(a)}</span>`).join('')}</div>`
    : '';

  const budgetBadge = l.budget === 'under' ? '<span class="badge under">under budget</span>'
    : l.budget === 'over' ? '<span class="badge over">over budget</span>'
    : l.budget === 'marginal' ? '<span class="badge marginal">marginal</span>'
    : '<span class="badge unknown">unknown</span>';

  // Price breakdown
  const breakdown = `
    <div class="detail-breakdown">
      <div class="bd-row"><span>5-night est all-in</span><strong>${fmt(l.est_5n)}</strong></div>
      ${l.displayed_5n ? `<div class="bd-row"><span>Displayed (5 nights)</span><span>${fmt(l.displayed_5n)}</span></div>` : ''}
      ${l.est_4n ? `<div class="bd-row"><span>4-night est</span><span>${fmt(l.est_4n)}</span></div>` : ''}
      <div class="bd-row total"><span>Per person · split ${SPLIT}</span><strong>${l.est_5n ? fmt(Math.ceil(l.est_5n / SPLIT)) : '—'}</strong></div>
    </div>`;

  // Map embed by area (no lat/lng in the data, so query by place name).
  const q = encodeURIComponent(`${l.area || ''} ${(DATA && DATA.trip.destination) || 'Los Angeles'}`.trim());
  const map = `<iframe class="detail-map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      src="https://maps.google.com/maps?q=${q}&z=11&output=embed" title="Map of ${escapeHtml(l.area || 'area')}"></iframe>`;

  const fCount = finalCount(l.id);

  return `
    <div class="detail-head">
      <h2 class="detail-name">${escapeHtml(l.name)}</h2>
      ${isDecision(l.id) ? '<span class="decision-ribbon inline">✅ Official pick</span>' : ''}
    </div>
    <div class="detail-loc">${escapeHtml(l.area || '')}${l.distance_mi ? ` · 📍 ${l.distance_mi} mi from DTLA` : ''} · <span class="source">${escapeHtml(l.source || '')}</span></div>
    <div class="detail-gallery">${detailGallery(l)}</div>
    <div class="detail-specs">${specs}</div>
    ${reviews}
    <div class="price-row"><span class="price">${fmt(l.est_5n)}</span> ${budgetBadge}</div>
    ${breakdown}
    ${l.note ? `<div class="note">${escapeHtml(l.note)}</div>` : ''}
    ${amenities}
    ${map}
    <div class="detail-actions">
      <a class="book" href="${l.url}" target="_blank" rel="noopener">${l.check_manual ? 'Check manually →' : 'View on ' + escapeHtml(l.source || 'site') + ' →'}</a>
      <div class="vote-bar">
        <button class="vote-btn up ${mine === 'up' ? 'mine' : ''}" data-detail-vote="up" title="Upvote"><span>👍</span><span class="count">${up}</span></button>
        <button class="vote-btn down ${mine === 'down' ? 'mine' : ''}" data-detail-vote="down" title="Downvote"><span>👎</span><span class="count">${down}</span></button>
      </div>
      <button class="final-btn ${isMyPick(l.id) ? 'mine' : ''}" data-detail-final="${l.id}"><span>⭐</span><span class="final-label">${isMyPick(l.id) ? 'My pick' : 'Top choice'}</span>${fCount ? `<span class="count">${fCount}</span>` : ''}</button>
      ${ADMIN_KEY ? `<button class="official-btn ${isDecision(l.id) ? 'active' : ''}" data-detail-official="${l.id}">${isDecision(l.id) ? '🔓 Unlock' : '📌 Make official'}</button>` : ''}
    </div>
  `;
}

function wireDetailHandlers(l) {
  const body = document.getElementById('detail-body');
  if (!body) return;

  // Gallery thumbnails swap the main image.
  body.querySelectorAll('.detail-thumb').forEach(t => {
    t.onclick = () => {
      const main = document.getElementById('detail-main-img');
      if (main) main.src = t.dataset.src;
      body.querySelectorAll('.detail-thumb').forEach(x => x.classList.toggle('active', x === t));
    };
  });

  // Voting from within the modal.
  body.querySelectorAll('[data-detail-vote]').forEach(btn => {
    btn.onclick = async () => {
      if (!requireSignIn('vote')) return;
      const myVote  = btn.dataset.detailVote;
      const current = (VOTES[String(l.id)] || {})[USER.id];
      const next    = current === myVote ? null : myVote;
      const res = await fetch('/api/votes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: String(l.id), vote: next }),
      });
      if (res.ok) { VOTES = await res.json(); render(); openDetail(l.id); }
      else if (res.status === 401) { USER = null; requireSignIn('vote'); }
    };
  });

  const fb = body.querySelector('[data-detail-final]');
  if (fb) fb.onclick = async () => { await toggleFinalPick(l.id); if (DETAIL_ID) openDetail(l.id); };

  const ob = body.querySelector('[data-detail-official]');
  if (ob) ob.onclick = async () => {
    if (isDecision(l.id)) { if (confirm('Unlock the official pick? This reopens the decision.')) { await setDecision(null); openDetail(l.id); } }
    else { if (confirm('Lock this as the group’s official pick?')) { await setDecision(l.id); openDetail(l.id); } }
  };
}

function openDetail(id) {
  const l = findListingById(id);
  if (!l) return;
  DETAIL_ID = String(id);
  const modal = document.getElementById('detail-modal');
  const body  = document.getElementById('detail-body');
  if (!modal || !body) return;
  body.innerHTML = renderDetail(l);
  body.scrollTop = 0;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  wireDetailHandlers(l);
}

function closeDetail() {
  DETAIL_ID = null;
  const modal = document.getElementById('detail-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

(function wireDetailModal() {
  const close   = document.getElementById('detail-close');
  const backdrop = document.getElementById('detail-backdrop');
  if (close)    close.onclick = closeDetail;
  if (backdrop) backdrop.onclick = closeDetail;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && DETAIL_ID) closeDetail(); });
})();

// ── Page routing (board / welcome / help / admin) ──────────────────────────────
const VIEW_IDS = { board: 'board-view', welcome: 'welcome-view', help: 'help-view', admin: 'admin-view' };

function viewFromHash() {
  const h = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
  if (h === 'help' || h === 'admin' || h === 'welcome' || h === 'board') return h;
  return null; // no/unknown hash → caller picks a default
}

function updateNav() {
  const link = document.querySelector('.nav-admin');
  if (link) link.classList.toggle('hidden', !ADMIN_KEY);
}

function showView(name) {
  closeDetail(); // never leave the listing modal open across a view change
  for (const [key, id] of Object.entries(VIEW_IDS)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', key !== name);
  }
  document.querySelectorAll('.nav-link').forEach(a =>
    a.classList.toggle('active', a.dataset.view === name));
  // The floating compare dock only makes sense on the board.
  const dock = document.getElementById('compare-dock');
  if (dock && name !== 'board') dock.classList.add('hidden');
  window.scrollTo(0, 0);
}

function route() {
  let name = viewFromHash();
  if (name === null) name = USER ? 'board' : 'welcome'; // default depends on sign-in
  showView(name);
  if (name === 'board') updateSelectionUI(); // restore dock state if anything is ticked
  if (name === 'admin') renderAdminDash();
  updateNav();
}

window.addEventListener('hashchange', route);

// ── Admin dashboard (Apify / Firecrawl / Gemini usage + group pulse) ───────────
function _money(n) { return n == null ? '—' : '$' + Number(n).toFixed(2); }
function _num(n)   { return n == null ? '—' : Number(n).toLocaleString(); }

function adminDashHtml(d) {
  const g = d.gemini || {}, f = d.firecrawl || {}, a = d.apify || {}, grp = d.group || {};
  const apifyPct = (a.spentUsd != null && a.limitUsd) ? Math.min(100, Math.round(a.spentUsd / a.limitUsd * 100)) : null;
  const runs = (a.recent || []).slice(0, 6).map(r =>
    `<div class="run-row"><span>${(r.startedAt || '').slice(0, 16).replace('T', ' ')}</span><span>${r.costUsd != null ? _money(r.costUsd) : '—'}</span><span class="run-status ${r.status === 'SUCCEEDED' ? 'ok' : ''}">${escapeHtml(r.status || '')}</span></div>`
  ).join('') || '<div class="run-row muted">no recent runs</div>';

  return `
  <div class="dash-grid">
    <div class="dash-card">
      <div class="dash-card-head"><span>🤖 Gemini</span><span class="dash-tag">${g.configured ? escapeHtml(g.model || '') : 'not configured'}</span></div>
      <div class="dash-big">${_money(g.estCostUsd)} <span class="dash-est">est. this month</span></div>
      <div class="dash-rows">
        <div><span>Calls</span><strong>${_num(g.calls)}</strong></div>
        <div><span>Input tokens</span><strong>${_num(g.promptTokens)}</strong></div>
        <div><span>Output tokens</span><strong>${_num(g.candidatesTokens)}</strong></div>
      </div>
      <div class="dash-note">Estimate from $${g.rates ? g.rates.inputPerM : '?'} in / $${g.rates ? g.rates.outputPerM : '?'} out per 1M tokens — Google has no per-key billing API.</div>
    </div>

    <div class="dash-card">
      <div class="dash-card-head"><span>🔥 Firecrawl</span><span class="dash-tag">${f.configured ? 'live' : 'not configured'}</span></div>
      <div class="dash-big">${f.remainingCredits != null ? _num(f.remainingCredits) : '—'} <span class="dash-est">credits left</span></div>
      <div class="dash-rows">
        <div><span>Plan credits</span><strong>${f.planCredits != null ? _num(f.planCredits) : '—'}</strong></div>
        <div><span>Scrapes this month</span><strong>${_num(f.callsThisMonth)}</strong></div>
      </div>
      <div class="dash-note">Last-resort price scraper for submitted listings.</div>
    </div>

    <div class="dash-card">
      <div class="dash-card-head"><span>🕷️ Apify</span><span class="dash-tag">${a.configured ? 'live' : 'not configured'}</span></div>
      <div class="dash-big">${_money(a.spentUsd)} <span class="dash-est">of ${a.limitUsd != null ? _money(a.limitUsd) : '$5.00 free'}</span></div>
      ${apifyPct != null ? `<div class="dash-bar"><span style="width:${apifyPct}%" class="${apifyPct >= 80 ? 'hot' : ''}"></span></div>` : ''}
      <div class="dash-runs"><div class="run-row head"><span>Recent runs</span><span>cost</span><span>status</span></div>${runs}</div>
    </div>

    <div class="dash-card">
      <div class="dash-card-head"><span>👥 Group pulse</span><span class="dash-tag">${grp.decisionLocked ? 'decision locked ✅' : 'open'}</span></div>
      <div class="dash-rows wide">
        <div><span>Members</span><strong>${_num(grp.members)}</strong></div>
        <div><span>Votes cast</span><strong>${_num(grp.votes)}</strong></div>
        <div><span>Top-choice picks</span><strong>${_num(grp.picks)}</strong></div>
        <div><span>Submissions</span><strong>${_num(grp.submissions)}</strong></div>
      </div>
      <div class="dash-note">Listings refreshed: ${escapeHtml(grp.refreshedAt || '—')} · usage month ${escapeHtml(d.month || '')}</div>
    </div>
  </div>`;
}

async function renderAdminDash() {
  const box = document.getElementById('admin-dash');
  if (!box) return;
  if (!ADMIN_KEY) {
    box.innerHTML = `<div class="admin-loading">You need admin access to view API usage.
      <button id="admin-login-cta" class="ai-btn primary">🔑 Enter admin key</button></div>`;
    const b = document.getElementById('admin-login-cta');
    if (b) b.onclick = async () => { await toggleAdmin(); if (ADMIN_KEY) renderAdminDash(); };
    return;
  }
  box.innerHTML = '<div class="admin-loading">Loading usage…</div>';
  try {
    const res = await fetch('/api/admin/usage', { headers: { 'x-admin-key': ADMIN_KEY } });
    if (!res.ok) { box.innerHTML = `<div class="admin-loading">Couldn’t load usage (HTTP ${res.status}).</div>`; return; }
    box.innerHTML = adminDashHtml(await res.json());
  } catch { box.innerHTML = '<div class="admin-loading">Network error loading usage.</div>'; }
}

// Wire nav links, welcome CTAs, and admin-view buttons once.
(function wirePages() {
  const wg = document.getElementById('welcome-google');
  const we = document.getElementById('welcome-email');
  if (wg) wg.onclick = signInGoogle;
  if (we) we.onclick = () => openAuthModal();
  const wtour = document.getElementById('welcome-tour');
  if (wtour) wtour.onclick = () => startOnboarding(true);

  const ar = document.getElementById('admin-refresh');
  if (ar) ar.onclick = renderAdminDash;
  const arp = document.getElementById('admin-run-pipeline');
  if (arp) arp.onclick = triggerPipeline;

  // Sign-in modal wiring.
  const ag = document.getElementById('auth-google');
  if (ag) ag.onclick = signInGoogle;
  const aform = document.getElementById('auth-email-form');
  if (aform) aform.addEventListener('submit', (e) => { e.preventDefault(); sendMagicLink(); });
  const aclose = document.getElementById('auth-close');
  if (aclose) aclose.onclick = closeAuthModal;
  const aback = document.getElementById('auth-backdrop');
  if (aback) aback.onclick = closeAuthModal;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('auth-modal').classList.contains('hidden')) closeAuthModal();
    if (!document.getElementById('onboard-modal').classList.contains('hidden')) endOnboarding();
  });
})();

// ── Onboarding tour (teaches how the app works) ─────────────────────────────────
const ONBOARD_SLIDES = [
  { icon: '🏡', title: 'Welcome to GroupPad', body: "One shared board to pick the LA house for 14 — together. Here's the 30-second tour." },
  { icon: '👍', title: 'Browse & like', body: 'Skim every 7+ bedroom home. Open any card for full photos, the price broken down, your per-person share, and a map. 👍 the ones you’d actually stay in.' },
  { icon: '⭐', title: 'Shortlist & compare', body: 'Liked homes rise into a shared shortlist. Tap 🤖 Compare with AI to weigh them against the itinerary and budget — or tick two cards for a 1v1.' },
  { icon: '✅', title: 'Pick the winner', body: 'Everyone casts one ⭐ top choice (your individual pick stays private — only totals show). The organizer locks the ✅ official pick when the group converges.' },
  { icon: '➕', title: 'Add & sign in', body: 'Found one we missed? Paste any VRBO / Airbnb / Booking.com link to add it. Sign in with Google or an email link so your votes follow you across devices.' },
];
let _onboardIdx = 0;

function renderOnboardSlide() {
  const s = ONBOARD_SLIDES[_onboardIdx];
  const stage = document.getElementById('onboard-stage');
  if (stage) stage.innerHTML =
    `<div class="onboard-slide"><div class="onboard-icon">${s.icon}</div>` +
    `<h3 class="onboard-h">${escapeHtml(s.title)}</h3>` +
    `<p class="onboard-p">${escapeHtml(s.body)}</p></div>`;
  const dots = document.getElementById('onboard-dots');
  if (dots) dots.innerHTML = ONBOARD_SLIDES.map((_, i) =>
    `<span class="onboard-dot ${i === _onboardIdx ? 'on' : ''}"></span>`).join('');
  const back = document.getElementById('onboard-back');
  if (back) back.style.visibility = _onboardIdx === 0 ? 'hidden' : 'visible';
  const next = document.getElementById('onboard-next');
  if (next) next.textContent = _onboardIdx === ONBOARD_SLIDES.length - 1 ? 'Get started' : 'Next';
}
function startOnboarding(force) {
  if (!force && localStorage.getItem('gp_onboarded')) return;
  _onboardIdx = 0;
  renderOnboardSlide();
  const m = document.getElementById('onboard-modal');
  if (m) m.classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function endOnboarding() {
  const m = document.getElementById('onboard-modal');
  if (m) m.classList.add('hidden');
  document.body.classList.remove('modal-open');
  localStorage.setItem('gp_onboarded', '1');
}
(function wireOnboarding() {
  const next = document.getElementById('onboard-next');
  if (next) next.onclick = () => {
    if (_onboardIdx >= ONBOARD_SLIDES.length - 1) { endOnboarding(); return; }
    _onboardIdx++; renderOnboardSlide();
  };
  const back = document.getElementById('onboard-back');
  if (back) back.onclick = () => { if (_onboardIdx > 0) { _onboardIdx--; renderOnboardSlide(); } };
  const skip = document.getElementById('onboard-skip');
  if (skip) skip.onclick = endOnboarding;
  const bd = document.getElementById('onboard-backdrop');
  if (bd) bd.onclick = endOnboarding;
})();

// ── Filter listeners ──────────────────────────────────────────────────────────
for (const id of ['f-under', 'f-pool', 'f-parking', 'f-manual']) {
  document.getElementById(id).addEventListener('change', render);
}

// Split slider
document.getElementById('f-split').addEventListener('input', (e) => {
  SPLIT = +e.target.value;
  render();
});

// Admin button (injected into filter bar)
(function injectAdminBtn() {
  const bar = document.querySelector('.filter-bar');
  if (!bar) return;

  // Admin toggle
  const btn = document.createElement('button');
  btn.id        = 'admin-btn';
  btn.className = 'admin-btn';
  btn.onclick   = toggleAdmin;
  bar.appendChild(btn);
  updateAdminButton();

  // Run pipeline (only visible to admin)
  const pipeBtn = document.createElement('button');
  pipeBtn.id        = 'pipeline-run-btn';
  pipeBtn.className = 'admin-btn';
  pipeBtn.title     = 'Fetch fresh listings from VRBO & Airbnb';
  pipeBtn.textContent = '⟳ Run pipeline';
  pipeBtn.onclick   = triggerPipeline;
  pipeBtn.style.display = ADMIN_KEY ? '' : 'none';
  bar.appendChild(pipeBtn);

  // Apify usage (only visible to admin)
  const usageBtn = document.createElement('button');
  usageBtn.id        = 'apify-usage-btn';
  usageBtn.className  = 'admin-btn';
  usageBtn.title      = 'Apify token spend this month';
  usageBtn.textContent = '📊 API usage';
  usageBtn.onclick   = () => { location.hash = '#/admin'; };
  usageBtn.style.display = ADMIN_KEY ? '' : 'none';
  bar.appendChild(usageBtn);
})();

async function showApifyUsage() {
  if (!ADMIN_KEY) { alert('Log in as admin first.'); return; }
  try {
    const res  = await fetch('/api/admin/apify-usage', { headers: { 'x-admin-key': ADMIN_KEY } });
    const data = await res.json();
    if (!res.ok) { alert('Error: ' + (data.error || res.status)); return; }
    const used  = data.usageUsd != null ? `$${Number(data.usageUsd).toFixed(3)}` : '—';
    const limit = data.limitUsd != null ? `$${Number(data.limitUsd).toFixed(2)}` : '$5.00 (free tier)';
    const runs  = (data.recent || []).slice(0, 8).map(r =>
      `  ${(r.startedAt||'').slice(0,16)}  ${r.costUsd!=null?('$'+Number(r.costUsd).toFixed(3)):'—'}  ${r.status}`
    ).join('\n') || '  (no recent runs)';
    alert(`Apify usage this month\n\nSpent: ${used} of ${limit}\n\nRecent runs (newest first):\n${runs}`);
  } catch {
    alert('Network error — check connection.');
  }
}

// Show/hide pipeline run button with admin state
const _origUpdateAdmin = updateAdminButton;
// (patch inline to also toggle pipeline btn)
function updateAdminButton() {
  const btn = document.getElementById('admin-btn');
  const pBtn = document.getElementById('pipeline-run-btn');
  if (btn) {
    if (ADMIN_KEY) { btn.textContent = '🔓 Admin'; btn.classList.add('admin-active'); }
    else           { btn.textContent = '🔑 Admin'; btn.classList.remove('admin-active'); }
  }
  if (pBtn) pBtn.style.display = ADMIN_KEY ? '' : 'none';
  const uBtn = document.getElementById('apify-usage-btn');
  if (uBtn) uBtn.style.display = ADMIN_KEY ? '' : 'none';
  const itAdmin = document.getElementById('itinerary-admin');
  if (itAdmin) itAdmin.classList.toggle('hidden', !ADMIN_KEY);
}

// ── Submit form ───────────────────────────────────────────────────────────────

// Live "open with trip dates" helper link
document.getElementById('submit-url').addEventListener('input', (e) => {
  const raw  = e.target.value.trim();
  const link = document.getElementById('submit-open-link');
  if (!raw) { link.classList.add('hidden'); return; }

  let dated = null;
  const abM = raw.match(/airbnb\.com\/rooms\/(\d+)/i);
  const vbM = raw.match(/vrbo\.com\/(\d+)/i);

  if (abM) {
    dated = `https://www.airbnb.com/rooms/${abM[1]}?check_in=2026-08-18&check_out=2026-08-23&adults=14`;
    link.textContent = 'Open with trip dates →';
  } else if (vbM) {
    dated = `https://www.vrbo.com/${vbM[1]}?startDate=2026-08-18&endDate=2026-08-23&adults=14`;
    link.textContent = 'Open with trip dates →';
  } else if (/booking\.com\/hotel/i.test(raw)) {
    dated = raw.split('?')[0] + '?checkin=2026-08-18&checkout=2026-08-23&group_adults=14';
    link.textContent = 'Open with trip dates →';
  } else {
    // Any other URL — validate and link as-is
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        dated = raw;
        link.textContent = 'Open listing →';
      }
    } catch { /* invalid URL */ }
  }

  if (dated) { link.href = dated; link.classList.remove('hidden'); }
  else        { link.classList.add('hidden'); }
});

document.getElementById('submit-toggle').addEventListener('click', () => {
  const form = document.getElementById('submit-form');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) document.getElementById('submit-url').focus();
});

document.getElementById('submit-btn').addEventListener('click', async () => {
  if (!requireSignIn('add a listing')) return;
  const urlEl   = document.getElementById('submit-url');
  const priceEl = document.getElementById('submit-price-input');
  const msgEl   = document.getElementById('submit-msg');
  const btn     = document.getElementById('submit-btn');
  const url     = urlEl.value.trim();

  if (!url) {
    msgEl.textContent = 'Please paste a URL.';
    msgEl.className   = 'submit-msg err';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Fetching details…';
  msgEl.textContent = '';
  msgEl.className   = 'submit-msg';

  try {
    const res  = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        manual_price: priceEl.value.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      SUBMITTED = [...SUBMITTED, data];
      urlEl.value   = '';
      priceEl.value = '';
      const bedStr = data.bd ? ` · ${data.bd} bd` : '';
      msgEl.textContent = `Added "${data.name}"${bedStr} — see it in Community Submissions below!`;
      msgEl.className   = 'submit-msg ok';
      render();
    } else {
      msgEl.textContent = data.error || 'Something went wrong.';
      msgEl.className   = 'submit-msg err';
    }
  } catch {
    msgEl.textContent = 'Network error — try again.';
    msgEl.className   = 'submit-msg err';
  }

  btn.disabled    = false;
  btn.textContent = 'Submit';
});

document.getElementById('submit-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('submit-btn').click();
});

// ── AI compare ────────────────────────────────────────────────────────────────
function getShortlistListings() {
  const pools = [...SUBMITTED, ...PIPELINE, ...(DATA && DATA.listings || [])];
  const out = [], seen = new Set();
  for (const l of pools) {
    const id = String(l.id);
    if (SHORTLIST_IDS.has(id) && !seen.has(id)) { seen.add(id); out.push(l); }
  }
  return out;
}

(function wireCompare() {
  const toggle = document.getElementById('compare-toggle');
  const panel  = document.getElementById('compare-panel');
  const runBtn = document.getElementById('compare-run');
  if (!toggle || !panel || !runBtn) return;

  toggle.addEventListener('click', () => panel.classList.toggle('hidden'));

  runBtn.addEventListener('click', async () => {
    const msg    = document.getElementById('compare-msg');
    const result = document.getElementById('compare-result');
    const items  = getShortlistListings();
    if (items.length < 2) {
      msg.textContent = 'Add at least 2 homes to your shortlist (like them or add them) to compare.';
      msg.className = 'compare-msg err';
      return;
    }
    runBtn.disabled = true;
    msg.textContent = 'Analyzing with Gemini…';
    msg.className = 'compare-msg';
    result.classList.add('hidden');

    try {
      const res = await fetch('/api/compare-listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listings:  items,
          criteria:  document.getElementById('compare-criteria').value.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        result.innerHTML = mdToHtml(data.analysis);
        result.classList.remove('hidden');
        msg.textContent = `Compared ${items.length} homes — saved as group insights for everyone.`;
        msg.className = 'compare-msg ok';
        // This analysis is now the shared group insight; reflect it live.
        INSIGHTS = { analysis: data.analysis, created_at: new Date().toISOString() };
        renderInsights();
      } else {
        msg.textContent = data.error || 'Comparison failed.';
        msg.className = 'compare-msg err';
      }
    } catch {
      msg.textContent = 'Network error — try again.';
      msg.className = 'compare-msg err';
    }
    runBtn.disabled = false;
  });

  // Admin: save the canonical itinerary
  const itSave = document.getElementById('itinerary-save');
  if (itSave) itSave.addEventListener('click', async () => {
    if (!ADMIN_KEY) { alert('Log in as admin first.'); return; }
    const itMsg = document.getElementById('itinerary-msg');
    const text  = document.getElementById('itinerary-edit').value.trim();
    itSave.disabled = true;
    try {
      const res = await fetch('/api/admin/itinerary', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) { ITINERARY = data; renderItinerary(); itMsg.textContent = 'Itinerary saved — it persists across deploys.'; itMsg.className = 'compare-msg ok'; }
      else { itMsg.textContent = data.error || 'Save failed.'; itMsg.className = 'compare-msg err'; }
    } catch { itMsg.textContent = 'Network error.'; itMsg.className = 'compare-msg err'; }
    itSave.disabled = false;
  });

  // Admin: clear / delete the currently-posted itinerary
  const itClear = document.getElementById('itinerary-clear');
  if (itClear) itClear.addEventListener('click', async () => {
    if (!ADMIN_KEY) { alert('Log in as admin first.'); return; }
    if (!confirm('Delete the posted itinerary? This clears it for everyone.')) return;
    const itMsg = document.getElementById('itinerary-msg');
    itClear.disabled = true;
    try {
      const res = await fetch('/api/admin/itinerary', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({ text: '' }),
      });
      const data = await res.json();
      if (res.ok) {
        ITINERARY = data;
        const box = document.getElementById('itinerary-edit');
        if (box) box.value = '';
        renderItinerary();
        itMsg.textContent = 'Itinerary cleared.'; itMsg.className = 'compare-msg ok';
      } else { itMsg.textContent = data.error || 'Clear failed.'; itMsg.className = 'compare-msg err'; }
    } catch { itMsg.textContent = 'Network error.'; itMsg.className = 'compare-msg err'; }
    itClear.disabled = false;
  });

  // Admin: load itinerary from a PDF / text file into the editor box
  const itFile = document.getElementById('itinerary-file');
  function setItMsg(text, cls) {
    const itMsg = document.getElementById('itinerary-msg');
    if (itMsg) { itMsg.textContent = text; itMsg.className = 'compare-msg ' + (cls || ''); }
  }
  function fillItBox(text, name) {
    const box = document.getElementById('itinerary-edit');
    if (box) box.value = String(text || '').slice(0, 8000);
    setItMsg(`Loaded “${name}” — click Save to publish.`, 'ok');
  }
  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error('PDF reader not loaded');
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Group text fragments into lines by their y-coordinate, then order each
      // line left-to-right by x. This reconstructs the page's actual layout
      // instead of dumping every fragment into one run-on string.
      const rows = [];
      for (const it of content.items) {
        if (!it.str) continue;
        const y = it.transform ? it.transform[5] : 0;
        const x = it.transform ? it.transform[4] : 0;
        let row = rows.find(r => Math.abs(r.y - y) <= 2.5);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, s: it.str });
      }
      rows.sort((a, b) => b.y - a.y); // top of page first
      const lines = rows.map(r =>
        r.items.sort((a, b) => a.x - b.x).map(o => o.s).join(' ')
          .replace(/\s+/g, ' ').trim()
      ).filter(Boolean);
      pages.push(lines.join('\n'));
    }
    return pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  if (itFile) itFile.addEventListener('change', async () => {
    const f = itFile.files && itFile.files[0];
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (isPdf) {
      setItMsg(`Reading “${f.name}”…`, '');
      try {
        const text = await extractPdfText(f);
        if (!text) { setItMsg('No selectable text found in that PDF (it may be scanned/image-only).', 'err'); }
        else fillItBox(text, f.name);
      } catch (e) {
        setItMsg('Could not read that PDF: ' + (e.message || 'error'), 'err');
      }
      itFile.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => fillItBox(reader.result, f.name);
    reader.onerror = () => setItMsg('Could not read that file.', 'err');
    reader.readAsText(f);
    itFile.value = '';
  });

  // Selection-driven comparison (tick cards, then compare)
  async function runSelectedCompare(mode) {
    const msg    = document.getElementById('h2h-msg');
    const result = document.getElementById('h2h-result');
    const items  = getSelectedListings();
    if (mode === '1v1' && items.length !== 2) { msg.textContent = 'Tick exactly 2 cards for a 1v1.'; msg.className = 'compare-msg err'; return; }
    if (items.length < 2) { msg.textContent = 'Tick at least 2 cards to compare.'; msg.className = 'compare-msg err'; return; }
    // Open the compare panel and bring the results into view so you don't have
    // to hunt for them — works whether triggered from the panel or the dock.
    document.getElementById('compare-panel')?.classList.remove('hidden');
    (document.querySelector('.h2h') || document.getElementById('shortlist-section'))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    msg.textContent = mode === '1v1' ? 'Battling it out with Gemini…' : 'Comparing your picks…';
    msg.className = 'compare-msg';
    result.classList.add('hidden');
    const btns = ['cmp-1v1','cmp-selected','cmp-clear'].map(id => document.getElementById(id));
    btns.forEach(b => b && (b.disabled = true));
    try {
      const body = { listings: items, criteria: (document.getElementById('compare-criteria')||{}).value || '' };
      if (mode === '1v1') body.mode = '1v1';
      const res = await fetch('/api/compare-listings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        result.innerHTML = mdToHtml(data.analysis); result.classList.remove('hidden');
        msg.textContent = `Compared ${items.length} home${items.length>2?'s':''}.`; msg.className = 'compare-msg ok';
        if (mode !== '1v1') { INSIGHTS = { analysis: data.analysis, created_at: new Date().toISOString() }; renderInsights(); }
      } else { msg.textContent = data.error || 'Comparison failed.'; msg.className = 'compare-msg err'; }
    } catch { msg.textContent = 'Network error — try again.'; msg.className = 'compare-msg err'; }
    updateSelectionUI();
  }
  const cmp1v1 = document.getElementById('cmp-1v1');
  const cmpSel = document.getElementById('cmp-selected');
  const cmpClr = document.getElementById('cmp-clear');
  if (cmp1v1) cmp1v1.addEventListener('click', () => runSelectedCompare('1v1'));
  if (cmpSel) cmpSel.addEventListener('click', () => runSelectedCompare('multi'));
  function clearSelection() {
    SELECTED.clear();
    document.querySelectorAll('.select-cb').forEach(cb => { cb.checked = false; cb.closest('.card')?.classList.remove('is-selected'); });
    updateSelectionUI();
  }
  if (cmpClr) cmpClr.addEventListener('click', clearSelection);

  // Floating dock mirrors the panel controls so you can compare from anywhere.
  document.getElementById('dock-1v1')?.addEventListener('click', () => runSelectedCompare('1v1'));
  document.getElementById('dock-selected')?.addEventListener('click', () => runSelectedCompare('multi'));
  document.getElementById('dock-clear')?.addEventListener('click', clearSelection);

  // Group caveats: post
  const cvSend = document.getElementById('caveat-send');
  if (cvSend) cvSend.addEventListener('click', async () => {
    const msg  = document.getElementById('caveat-msg');
    const textEl = document.getElementById('caveat-text');
    const text = textEl.value.trim();
    if (!text) { msg.textContent = 'Type a caveat first.'; msg.className = 'compare-msg err'; return; }
    if (!requireSignIn('post a caveat')) return;
    cvSend.disabled = true;
    try {
      const res = await fetch('/api/caveats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) { CAVEATS = data; textEl.value = ''; renderCaveats(); msg.textContent = ''; }
      else if (res.status === 401) { USER = null; render(); requireSignIn('post a caveat'); }
      else { msg.textContent = data.error || 'Failed.'; msg.className = 'compare-msg err'; }
    } catch { msg.textContent = 'Network error.'; msg.className = 'compare-msg err'; }
    cvSend.disabled = false;
  });
  const cvText = document.getElementById('caveat-text');
  if (cvText) cvText.addEventListener('keydown', e => { if (e.key === 'Enter') cvSend.click(); });
})();

// ── Surface load failures to the user ──────────────────────────────────────────
function showLoadError(msg) {
  let bar = document.getElementById('load-error');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'load-error';
    bar.className = 'load-error';
    document.body.prepend(bar);
  }
  bar.innerHTML = `${escapeHtml(msg)} <button id="load-retry">Retry</button>`;
  document.getElementById('load-retry').onclick = () => location.reload();
}

// ── Poll for vote updates ─────────────────────────────────────────────────────
(async () => {
  try {
    await loadData();
    if (!DATA) throw new Error('no data');
    render();
    route();
    // First-time visitors who aren't signed in get the quick tour.
    if (!USER) startOnboarding(false);
  } catch {
    showLoadError('Couldn’t load listings — check your connection.');
    return;
  }
  setInterval(async () => {
    try {
      const [v, f] = await Promise.all([
        fetch('/api/votes').then(r => r.json()),
        fetch('/api/final').then(r => r.json()).catch(() => FINAL),
      ]);
      const changed = JSON.stringify(v) !== JSON.stringify(VOTES)
                   || JSON.stringify(f) !== JSON.stringify(FINAL);
      if (changed) { VOTES = v; if (f && f.counts) FINAL = f; render(); }
    } catch {}
  }, 8000);
})();
