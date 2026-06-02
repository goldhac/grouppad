// ── Identity ──────────────────────────────────────────────────────────────────
function getVoter() {
  let v = localStorage.getItem('voter');
  if (!v) {
    v = prompt('Your name (used for voting)?') || 'guest-' + Math.floor(Math.random() * 9999);
    localStorage.setItem('voter', v);
  }
  return v;
}

const VOTER = getVoter();
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

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  const [data, votes, submitted, pipeline, itinerary, caveats, insights] = await Promise.all([
    fetch('/api/listings').then(r => r.json()),
    fetch('/api/votes').then(r => r.json()).catch(() => ({})),
    fetch('/api/submitted').then(r => r.json()).catch(() => []),
    fetch('/api/pipeline-listings').then(r => r.json()).catch(() => ({ listings: [] })),
    fetch('/api/itinerary').then(r => r.json()).catch(() => ({ text: '', updated_at: null })),
    fetch('/api/caveats').then(r => r.json()).catch(() => []),
    fetch('/api/insights').then(r => r.json()).catch(() => null),
  ]);
  DATA      = data;
  VOTES     = votes;
  SUBMITTED = submitted;
  PIPELINE  = pipeline.listings || [];
  ITINERARY = itinerary || { text: '', updated_at: null };
  CAVEATS   = Array.isArray(caveats) ? caveats : [];
  INSIGHTS  = insights && insights.analysis ? insights : null;
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
    if (voter === VOTER) mine = vote;
  }
  return { up, down, mine };
}

function netVotes(listingId) {
  const { up, down } = tallyVotes(listingId);
  return up - down;
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

  return `
    <div class="${cls}" data-id="${l.id}">
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
    const res = await fetch(`/api/admin/verify?key=${encodeURIComponent(key)}`);
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
    const res = await fetch(`/api/admin/run-pipeline?key=${encodeURIComponent(ADMIN_KEY)}`, { method: 'POST' });
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

  const listings   = DATA.listings;
  const underCount = listings.filter(l => l.budget === 'under').length;

  document.getElementById('params-line').innerHTML =
    `<span><strong>Sites:</strong> VRBO · Airbnb · Booking.com</span>` +
    `<span><strong>Listings:</strong> ${listings.length}</span>` +
    `<span><strong>Under budget:</strong> ${underCount}</span>` +
    `<span><strong>Refreshed:</strong> ${t.refreshed_at}</span>` +
    `<span><strong>Voting as:</strong> ${VOTER} <a href="#" id="change-voter" style="color:var(--link)">change</a></span>`;

  document.getElementById('change-voter').onclick = (e) => {
    e.preventDefault();
    localStorage.removeItem('voter');
    location.reload();
  };

  const onlyUnder  = document.getElementById('f-under').checked;
  const needPool   = document.getElementById('f-pool').checked;
  const needPark   = document.getElementById('f-parking').checked;
  const showManual = document.getElementById('f-manual').checked;

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
}

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
      const res = await fetch(`/api/caveats/${btn.dataset.id}?key=${encodeURIComponent(ADMIN_KEY)}`, { method: 'DELETE' });
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
  body.innerHTML = mdToHtml(INSIGHTS.analysis);
  if (when && INSIGHTS.created_at) {
    const d = new Date(INSIGHTS.created_at);
    when.textContent = `updated ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

// Reflect the current card selection in the compare controls.
function updateSelectionUI() {
  const n = SELECTED.size;
  const countEl = document.getElementById('select-count');
  if (countEl) countEl.textContent = `${n} selected`;
  const b1v1   = document.getElementById('cmp-1v1');
  const bSel   = document.getElementById('cmp-selected');
  const bClear = document.getElementById('cmp-clear');
  if (b1v1)   b1v1.disabled   = n !== 2;
  if (bSel)   bSel.disabled   = n < 2;
  if (bClear) bClear.disabled = n === 0;
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
      const card      = btn.closest('.card');
      const listingId = card.dataset.id;
      const myVote    = btn.dataset.vote;
      const current   = (VOTES[listingId] || {})[VOTER];
      const next      = current === myVote ? null : myVote;
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, voter: VOTER, vote: next }),
      });
      if (res.ok) { VOTES = await res.json(); render(); }
    };
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
      const res = await fetch(`${endpoint}?key=${encodeURIComponent(ADMIN_KEY)}`, { method: 'DELETE' });

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
  usageBtn.onclick   = showApifyUsage;
  usageBtn.style.display = ADMIN_KEY ? '' : 'none';
  bar.appendChild(usageBtn);
})();

async function showApifyUsage() {
  if (!ADMIN_KEY) { alert('Log in as admin first.'); return; }
  try {
    const res  = await fetch(`/api/admin/apify-usage?key=${encodeURIComponent(ADMIN_KEY)}`);
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
  const urlEl   = document.getElementById('submit-url');
  const priceEl = document.getElementById('submit-price-input');
  const nameEl  = document.getElementById('submit-name-input');
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
        submitted_by: nameEl.value.trim() || VOTER,
        manual_price: priceEl.value.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      SUBMITTED = [...SUBMITTED, data];
      urlEl.value   = '';
      priceEl.value = '';
      nameEl.value  = '';
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
      const res = await fetch(`/api/admin/itinerary?key=${encodeURIComponent(ADMIN_KEY)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) { ITINERARY = data; renderItinerary(); itMsg.textContent = 'Itinerary saved — it persists across deploys.'; itMsg.className = 'compare-msg ok'; }
      else { itMsg.textContent = data.error || 'Save failed.'; itMsg.className = 'compare-msg err'; }
    } catch { itMsg.textContent = 'Network error.'; itMsg.className = 'compare-msg err'; }
    itSave.disabled = false;
  });

  // Admin: load itinerary from a text file into the editor box
  const itFile = document.getElementById('itinerary-file');
  if (itFile) itFile.addEventListener('change', () => {
    const f = itFile.files && itFile.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const box = document.getElementById('itinerary-edit');
      if (box) box.value = String(reader.result || '').slice(0, 8000);
      const itMsg = document.getElementById('itinerary-msg');
      if (itMsg) { itMsg.textContent = `Loaded “${f.name}” — click Save to publish.`; itMsg.className = 'compare-msg ok'; }
    };
    reader.readAsText(f);
  });

  // Selection-driven comparison (tick cards, then compare)
  async function runSelectedCompare(mode) {
    const msg    = document.getElementById('h2h-msg');
    const result = document.getElementById('h2h-result');
    const items  = getSelectedListings();
    if (mode === '1v1' && items.length !== 2) { msg.textContent = 'Tick exactly 2 cards for a 1v1.'; msg.className = 'compare-msg err'; return; }
    if (items.length < 2) { msg.textContent = 'Tick at least 2 cards to compare.'; msg.className = 'compare-msg err'; return; }
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
  if (cmpClr) cmpClr.addEventListener('click', () => {
    SELECTED.clear();
    document.querySelectorAll('.select-cb').forEach(cb => { cb.checked = false; cb.closest('.card')?.classList.remove('is-selected'); });
    updateSelectionUI();
  });

  // Group caveats: post
  const cvSend = document.getElementById('caveat-send');
  if (cvSend) cvSend.addEventListener('click', async () => {
    const msg  = document.getElementById('caveat-msg');
    const nameEl = document.getElementById('caveat-name');
    const textEl = document.getElementById('caveat-text');
    const text = textEl.value.trim();
    if (!text) { msg.textContent = 'Type a caveat first.'; msg.className = 'compare-msg err'; return; }
    cvSend.disabled = true;
    try {
      const res = await fetch('/api/caveats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameEl.value.trim() || VOTER, text }),
      });
      const data = await res.json();
      if (res.ok) { CAVEATS = data; textEl.value = ''; renderCaveats(); msg.textContent = ''; }
      else { msg.textContent = data.error || 'Failed.'; msg.className = 'compare-msg err'; }
    } catch { msg.textContent = 'Network error.'; msg.className = 'compare-msg err'; }
    cvSend.disabled = false;
  });
  const cvText = document.getElementById('caveat-text');
  if (cvText) cvText.addEventListener('keydown', e => { if (e.key === 'Enter') cvSend.click(); });
})();

// ── Poll for vote updates ─────────────────────────────────────────────────────
(async () => {
  await loadData();
  render();
  setInterval(async () => {
    try {
      const v = await fetch('/api/votes').then(r => r.json());
      if (JSON.stringify(v) !== JSON.stringify(VOTES)) { VOTES = v; render(); }
    } catch {}
  }, 8000);
})();
