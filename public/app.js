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
let SPLIT     = 14;
let ADMIN_KEY = localStorage.getItem('admin_key') || null;

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  const [data, votes, submitted] = await Promise.all([
    fetch('/api/listings').then(r => r.json()),
    fetch('/api/votes').then(r => r.json()).catch(() => ({})),
    fetch('/api/submitted').then(r => r.json()).catch(() => []),
  ]);
  DATA      = data;
  VOTES     = votes;
  SUBMITTED = submitted;
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
function renderPerPerson(est5n) {
  if (!est5n) return '';
  const pp    = Math.ceil(est5n / SPLIT);
  const isOver = DATA && est5n > DATA.trip.budget;
  return `
    <div class="per-person-row${isOver ? ' over' : ''}">
      <span class="per-person-amount">${fmt(pp)}</span>
      <span class="per-person-label">per person · split ${SPLIT} ways</span>
    </div>
  `;
}

// ── Card ──────────────────────────────────────────────────────────────────────
function renderCard(l, isSubmitted) {
  const overBudget = l.budget === 'over';
  const cls = [
    'card',
    overBudget      ? 'over-budget'  : '',
    l.check_manual  ? 'check-manual' : '',
    isSubmitted     ? 'submitted'    : '',
  ].filter(Boolean).join(' ');

  const budgetBadge = l.budget === 'under'    ? '<span class="badge under">under budget</span>'
    : l.budget === 'over'    ? '<span class="badge over">over budget</span>'
    : l.budget === 'marginal' ? '<span class="badge marginal">marginal</span>'
    : '<span class="badge unknown">unknown</span>';

  const rankBadge = isSubmitted
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

  const submittedBy = isSubmitted
    ? `<div class="submitted-by-line">Submitted by ${l.submitted_by} · ${l.submitted_at}</div>` : '';

  const adminDeleteBtn = ADMIN_KEY
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
        <div class="amenities">${amenity('pool', l.pool)}${amenity('parking', l.parking)}</div>
        ${reviews}
        <div class="price-row">
          <span class="price">${fmt(l.est_5n)}</span>
          ${budgetBadge}
        </div>
        <div class="price-sub">${l.displayed_5n
          ? `displayed: ${fmt(l.displayed_5n)} for 5 nights · 4-night est: ${fmt(l.est_4n)}`
          : 'price on inquiry'}</div>
        ${renderPerPerson(l.est_5n)}
        <div class="note">${l.note}</div>
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

  const filtered = listings.filter(l => {
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
  updateSplitDisplay();
  attachCardHandlers();
}

function renderSubmitted() {
  const section = document.getElementById('submitted-section');
  const grid    = document.getElementById('submitted-grid');
  if (!SUBMITTED.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  grid.innerHTML = SUBMITTED.map(l => renderCard(l, true)).join('');
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
  const btn = document.createElement('button');
  btn.id        = 'admin-btn';
  btn.className = 'admin-btn';
  btn.onclick   = toggleAdmin;
  bar.appendChild(btn);
  updateAdminButton();
})();

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
  } else if (vbM) {
    dated = `https://www.vrbo.com/${vbM[1]}?startDate=2026-08-18&endDate=2026-08-23&adults=14`;
  } else if (/booking\.com\/hotel/i.test(raw)) {
    dated = raw.split('?')[0] + '?checkin=2026-08-18&checkout=2026-08-23&group_adults=14';
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
