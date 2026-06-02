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

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  const [data, votes, submitted, pipeline] = await Promise.all([
    fetch('/api/listings').then(r => r.json()),
    fetch('/api/votes').then(r => r.json()).catch(() => ({})),
    fetch('/api/submitted').then(r => r.json()).catch(() => []),
    fetch('/api/pipeline-listings').then(r => r.json()).catch(() => ({ listings: [] })),
  ]);
  DATA      = data;
  VOTES     = votes;
  SUBMITTED = submitted;
  PIPELINE  = pipeline.listings || [];
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
  updateSplitDisplay();
  attachCardHandlers();
}

// Liked (net upvotes ≥ 1) homes + member submissions, pulled to the top.
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
    const liked = netVotes(id) >= 1;
    if (it.submitted || liked) { seen.add(id); items.push(it); }
  }

  SHORTLIST_IDS = new Set(items.map(it => String(it.l.id)));

  if (!items.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  items.sort((a, b) => (netVotes(String(b.l.id)) - netVotes(String(a.l.id))) || (mansionScore(b.l) - mansionScore(a.l)));
  grid.innerHTML = items.map(it => renderCard(it.l, it.submitted, it.pipeline)).join('');
}

function renderSubmitted() {
  // Submissions are folded into the shortlist now; keep this section hidden.
  const section = document.getElementById('submitted-section');
  if (section) section.classList.add('hidden');
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
})();

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
      msgEl.textContent = `Added "${data.name}"${bedStr} — see it below!`;
      msgEl.className   = 'submit-msg ok';
      renderSubmitted();
      attachCardHandlers();
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
          itinerary: document.getElementById('compare-itinerary').value.trim(),
          criteria:  document.getElementById('compare-criteria').value.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        result.innerHTML = mdToHtml(data.analysis);
        result.classList.remove('hidden');
        msg.textContent = `Compared ${items.length} homes.`;
        msg.className = 'compare-msg ok';
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
