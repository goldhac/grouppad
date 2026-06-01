// Voter name lives in localStorage. Will be replaced with auth later.
function getVoter() {
  let v = localStorage.getItem('voter');
  if (!v) {
    v = prompt('Your name (used for voting)?') || 'guest-' + Math.floor(Math.random() * 9999);
    localStorage.setItem('voter', v);
  }
  return v;
}

const VOTER = getVoter();
let DATA = null;
let VOTES = {};

async function loadData() {
  const [data, votes] = await Promise.all([
    fetch('/api/listings').then(r => r.json()),
    fetch('/api/votes').then(r => r.json()).catch(() => ({})),
  ]);
  DATA = data;
  VOTES = votes;
}

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
      <div class="carousel-track" style="transform: translateX(0%)">${slides}</div>
      ${photos.length > 1 ? `
        <button class="carousel-btn prev" aria-label="Previous">‹</button>
        <button class="carousel-btn next" aria-label="Next">›</button>
        <div class="carousel-dots">${dots}</div>
      ` : ''}
    </div>
  `;
}

function renderCard(l) {
  const overBudget = l.budget === 'over';
  const cls = [
    'card',
    overBudget ? 'over-budget' : '',
    l.check_manual ? 'check-manual' : '',
  ].filter(Boolean).join(' ');
  const budgetBadge = l.budget === 'under' ? '<span class="badge under">under budget</span>'
    : l.budget === 'over' ? '<span class="badge over">over budget</span>'
    : l.budget === 'marginal' ? '<span class="badge marginal">marginal</span>'
    : '<span class="badge unknown">unknown</span>';
  const rankBadge = l.rank <= 3
    ? `<span class="rank top">★ Rank ${l.rank}</span>`
    : `<span class="rank">Rank ${l.rank}</span>`;
  const specs = [
    l.bd != null ? `<span>${l.bd} bd</span>` : '',
    l.ba != null ? `<span>${l.ba} ba</span>` : '',
    l.sleeps != null ? `<span>sleeps ${l.sleeps}</span>` : '',
  ].filter(Boolean).join('');
  const reviews = l.rating != null
    ? `<div class="reviews"><strong>${l.rating}★</strong> (${l.reviews ?? '?'} reviews)${l.superhost ? ' · Superhost' : ''}</div>`
    : (l.reviews ? `<div class="reviews">(${l.reviews} reviews)</div>` : '<div class="reviews">no rating yet</div>');
  const { up, down, mine } = tallyVotes(l.id);
  return `
    <div class="${cls}" data-id="${l.id}" data-budget="${l.budget}" data-pool="${l.pool}" data-parking="${l.parking}" data-manual="${l.check_manual ? '1' : '0'}">
      ${renderCarousel(l)}
      <div class="card-body">
        <div class="rank-row">${rankBadge}<span class="source">${l.source}</span></div>
        <h2 class="name">${l.name}</h2>
        <div class="area">${l.area}</div>
        <div class="specs">${specs}</div>
        <div class="amenities">${amenity('pool', l.pool)}${amenity('parking', l.parking)}</div>
        ${reviews}
        <div class="price-row">
          <span class="price">${fmt(l.est_5n)}</span>
          ${budgetBadge}
        </div>
        <div class="price-sub">${l.displayed_5n ? `displayed: ${fmt(l.displayed_5n)} for 5 nights · 4-night est: ${fmt(l.est_4n)}` : 'price on inquiry'}</div>
        <div class="note">${l.note}</div>
        <div class="actions">
          <a class="book" href="${l.url}" target="_blank" rel="noopener">${l.check_manual ? 'Check manually →' : 'View on ' + l.source + ' →'}</a>
          <div class="vote-bar">
            <button class="vote-btn up ${mine === 'up' ? 'mine' : ''}" data-vote="up" title="Upvote"><span>👍</span><span class="count">${up}</span></button>
            <button class="vote-btn down ${mine === 'down' ? 'mine' : ''}" data-vote="down" title="Downvote"><span>👎</span><span class="count">${down}</span></button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function render() {
  if (!DATA) return;
  const t = DATA.trip;
  document.getElementById('trip-line').textContent =
    `${t.checkin} → ${t.checkout_5n} (5 nights) · ${t.adults} guests · budget $${t.budget.toLocaleString()} all-in`;
  const listings = DATA.listings;
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

  const onlyUnder = document.getElementById('f-under').checked;
  const needPool = document.getElementById('f-pool').checked;
  const needParking = document.getElementById('f-parking').checked;
  const showManual = document.getElementById('f-manual').checked;

  const filtered = listings.filter(l => {
    if (onlyUnder && l.budget !== 'under' && l.budget !== 'marginal') return false;
    if (needPool && l.pool !== 'yes') return false;
    if (needParking && l.parking !== 'yes') return false;
    if (!showManual && l.check_manual) return false;
    return true;
  });

  document.getElementById('count').textContent = `${filtered.length} of ${listings.length} listings`;
  document.getElementById('grid').innerHTML = filtered.length
    ? filtered.map(renderCard).join('')
    : '<div style="grid-column:1/-1;color:var(--muted);padding:40px 0;text-align:center;">No listings match these filters.</div>';
  attachCardHandlers();
}

function attachCardHandlers() {
  // Carousel nav
  document.querySelectorAll('.carousel').forEach(carousel => {
    const track = carousel.querySelector('.carousel-track');
    const dots = carousel.querySelectorAll('.dot');
    const len = +carousel.dataset.len;
    const go = (i) => {
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
      const card = btn.closest('.card');
      const listingId = card.dataset.id;
      const myVote = btn.dataset.vote;
      const current = (VOTES[listingId] || {})[VOTER];
      const next = current === myVote ? null : myVote;
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, voter: VOTER, vote: next }),
      });
      if (res.ok) {
        VOTES = await res.json();
        render();
      }
    };
  });
}

for (const id of ['f-under', 'f-pool', 'f-parking', 'f-manual']) {
  document.getElementById(id).addEventListener('change', render);
}

(async () => {
  await loadData();
  render();
  // Poll for vote updates every 8s so group members see each other's votes
  setInterval(async () => {
    try {
      const v = await fetch('/api/votes').then(r => r.json());
      if (JSON.stringify(v) !== JSON.stringify(VOTES)) {
        VOTES = v;
        render();
      }
    } catch {}
  }, 8000);
})();
