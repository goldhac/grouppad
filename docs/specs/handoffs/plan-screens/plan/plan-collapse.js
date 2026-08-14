/* ============================================================================
   GroupPad — PLAN SCREEN + PLAN MODAL · renderer
   One day component, two states (summary row ⇄ routed timeline).
   Icons: share/share-icons.js signature set. No stock glyphs, no emoji.
   ============================================================================ */
(function () {
  const T = window.GP_TRAVEL;
  const g = (n, c) => `<span class="${c || 'g'}">${T.I[n] || ''}</span>`;
  const IMG = (id, w, h) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=80&auto=format`;
  const money = n => '$' + n.toLocaleString('en-US');
  const shot = (id, w, h) => id ? `<img src="${IMG(id, w, h)}" alt="" loading="lazy" onerror="this.remove()"/>` : '';

  /* ---------------- data (mirrors the live board) ---------------- */
  const HOUSE_OUT = 'Leave the house', HOUSE_BACK = 'Home for the night';
  const GAP = 'evening’s open — nobody has voted on it yet';

  const mineDays = [
    { wd: 'Tue', dn: 'Aug 18', arc: '9:30a – 1:00p', out: '3 hr 30 min', driving: '1 hr 30 min', pp: 10,
      go: { t: '9:30a', dur: '~45 min', mi: '29.7 mi', long: true, aside: 'a long haul — most of a morning' },
      back: { t: '1:00p', dur: '~45 min', mi: '29.7 mi' },
      detour: { nm: 'The World-Famous Studio Tour', note: 'right on the way', img: '1489599849927-2ee91cede3ba' },
      stops: [{ t: '10:15a', nm: 'Walk Griffith Park with Hollywood tales', dur: '2 hr', pp: 10, tag: 'voted', img: '1506905925346-21bda4d32df4',
        why: 'A flat two hours to open the trip — nobody’s legs are wrecked on day one.' }],
      gapAfter: '12:15p' },
    { wd: 'Wed', dn: 'Aug 19', arc: '9:30a – 1:30p', out: '4 hr', driving: '1 hr 30 min', pp: 33,
      go: { t: '9:30a', dur: '~45 min', mi: '28.8 mi', long: true, aside: 'a long haul — most of a morning' },
      back: { t: '1:30p', dur: '~45 min', mi: '28.8 mi' },
      detour: { nm: 'Hollywood Bowl Overlook', note: 'right on the way', img: '1580655653885-65763b2597d0' },
      stops: [{ t: '10:15a', nm: 'Hike to the Hollywood sign', dur: '2 hr 30 min', pp: 33, tag: 'voted', img: '1580655653885-65763b2597d0',
        why: 'The trail faces east, so a mid-morning start keeps the sun behind you.' }],
      gapAfter: '12:45p' },
    { wd: 'Thu', dn: 'Aug 20', arc: '9:30a – 1:50p', out: '4 hr 20 min', driving: '2 hr 20 min', pp: 160,
      go: { t: '9:30a', dur: '~1 hr 10 min', mi: '51.0 mi', long: true, aside: 'the longest drive of the week' },
      back: { t: '1:50p', dur: '~1 hr 10 min', mi: '51.0 mi' },
      stops: [{ t: '10:40a', nm: 'Meet the Bees: Guided Apiary Tour & Honey Tasting', dur: '2 hr', pp: 160, tag: 'voted', img: '1587049352846-4a222e784d38',
        why: 'The priciest thing on the list at $160 each — worth deciding as a group before anyone commits.' }],
      gapAfter: '12:40p' },
    { wd: 'Fri', dn: 'Aug 21', arc: '9:30a – 12:35p', out: '3 hr 5 min', driving: '1 hr 20 min', pp: 50,
      go: { t: '9:30a', dur: '~40 min', mi: '26.0 mi' },
      back: { t: '12:35p', dur: '~40 min', mi: '26.0 mi' },
      stops: [{ t: '10:10a', nm: 'Meet Drunk Theatre Co’s cast and watch the show', dur: '1 hr 45 min', pp: 50, tag: 'voted', img: '1503095396549-807759245b35',
        why: 'A late-morning show, so the afternoon stays free for whatever the group decides.' }],
      gapAfter: '11:55a' },
  ];

  const scoutDays = [
    { wd: 'Tue', dn: 'Aug 18', arc: '9:30a – 12:00p', out: '2 hr 30 min', driving: '1 hr 30 min', pp: 44,
      go: { t: '9:30a', dur: '~45 min', mi: '27.7 mi', long: true, aside: 'a long haul — most of a morning' },
      back: { t: '12:00p', dur: '~45 min', mi: '27.7 mi' },
      detour: { nm: 'Project 23', note: '0.6 mi off the route', img: '1544967082-d9d25d867d66' },
      stops: [{ t: '10:15a', nm: 'Pickle tasting adventure with the Pickleman', dur: '1 hr', pp: 44, tag: 'voted', img: '1607532941433-304659e8198a',
        why: 'The only thing anyone has voted for so far — so it anchors the day.' }],
      gapAfter: '11:15a' },
  ];

  const LEAD = { nm: 'Pickle tasting adventure with the Pickleman', meta: '$44/guest · 1 hr', net: 1, party: 14, img: '1607532941433-304659e8198a', you: true };

  /* ---------------- state ---------------- */
  const S = {
    panels: { group: true, scout: true, mine: true },
    open: new Set(['mine-0', 'scout-0']),
    modalOpen: new Set(['m-0']),
    modal: false,
    density: 'compact',
  };
  const key = (ns, i) => `${ns}-${i}`;

  /* ---------------- day component ---------------- */
  function bookend(b, kind) {
    return `<div class="pl-bookend ${b.long ? 'long' : ''}">
      <span class="hg">${g('house')}</span>
      <span class="lb">${kind === 'out' ? HOUSE_OUT : HOUSE_BACK}</span>
      <span class="tm">${b.t}</span>
      <span style="opacity:.5">·</span>
      <span class="drive">${g('drive')}<span class="d">${b.dur}</span><span>${b.mi}</span></span>
      ${b.aside ? `<span class="aside">— ${b.aside}</span>` : ''}
    </div>`;
  }
  function stopRow(s) {
    const tag = s.tag === 'voted' ? `<span class="badge badge-up pl-tag">${g('voted')} Voted in</span>`
      : s.tag === 'pinned' ? `<span class="badge badge-pinned pl-tag">${g('pinned')} Pinned</span>`
      : s.tag === 'added' ? `<span class="badge pl-tag">${g('sparkles')} Scout added</span>` : '';
    return `<div class="pl-stop">
      <span class="shot"><span class="fb">${T.MARK(20)}</span>${shot(s.img, 240, 190)}</span>
      <span class="bd">
        <span class="top"><span class="tm">${s.t}</span><span class="nm">${s.nm}</span>${tag}</span>
        <span class="pl-facts"><span class="f">${g('clock')}${s.dur}</span><span class="div"></span><span class="f money">${money(s.pp)} per person</span></span>
        ${s.why ? `<span class="pl-why">${s.why}</span>` : ''}
      </span></div>`;
  }
  const detourRow = d => `<div class="pl-detour"><span class="th">${shot(d.img, 90, 90)}</span><span class="nm">${d.nm}</span><span class="note">· optional, ${d.note}</span><span class="add">${g('plus')}Add</span></div>`;
  const gapRow = t => `<div class="pl-gap"><span class="txt">After ${t} the ${GAP}</span><span class="dsh"></span><span class="find">Find something</span></div>`;

  function day(d, ns, i, openSet) {
    const k = key(ns, i), open = openSet.has(k);
    const lead = d.stops[0];
    return `<div class="pl-day ${open ? 'open' : ''}" data-day="${k}">
      <div class="pl-dayrow" data-toggle-day="${k}">
        <span class="chev">${g('chev')}</span>
        <span class="date"><span class="wd">${d.wd}</span><span class="dn">${d.dn}</span></span>
        <span class="gist">
          <span class="ph">${shot(lead.img, 100, 88) || T.MARK(16)}</span>
          <span class="tx"><span class="nm">${lead.nm}</span><span class="mo">${d.stops.length > 1 ? d.stops.length + ' stops · ' : ''}${lead.dur}${d.detour ? ' · 1 optional detour' : ''}</span></span>
        </span>
        <span class="figs">
          <span class="arc">${d.arc}</span>
          <span class="hide-open"><b>${d.out}</b> out</span>
          <span class="hide-open"><b>${d.driving}</b> driving</span>
          <span class="money">${money(d.pp)} pp</span>
        </span>
      </div>
      <div class="pl-daybody">
        ${bookend(d.go, 'out')}
        ${d.detour ? detourRow(d.detour) : ''}
        ${d.stops.map(stopRow).join('')}
        ${d.gapAfter ? gapRow(d.gapAfter) : ''}
        ${bookend(d.back, 'back')}
        <div class="pl-wrap">${g('flag')}<span class="lab">That’s a wrap for ${fullDay(d.wd)}</span>
          <span class="figs"><span><b>${d.out}</b> out</span><span><b>${d.driving}</b> driving</span><span><b>${money(d.pp)}</b> pp</span></span></div>
      </div>
    </div>`;
  }
  const fullDay = wd => ({ Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' })[wd] || wd;
  const totals = days => ({
    pp: days.reduce((a, d) => a + d.pp, 0),
    acts: days.reduce((a, d) => a + d.stops.length, 0),
    days: days.length,
  });

  /* ---------------- panels ---------------- */
  function panelHead(kind, mk, kindLabel, kindIcon, title, sub, acts) {
    const kb = kind === 'group' ? 'badge-rank-soft' : kind === 'scout' ? 'badge-scout' : 'badge-mine';
    return `<div class="pl-ph" data-toggle-panel="${kind}">
      <span class="mk">${g(mk)}</span>
      <span class="hh">
        <span class="badge ${kb} pl-kind pl-caps">${g(kindIcon)} ${kindLabel}</span>
        <div class="t">${title}</div><div class="s">${sub}</div>
      </span>
      <span class="acts" data-stop>${acts}</span>
      <span class="chev">${g('chev')}</span>
    </div>`;
  }
  const thumbs = days => `<span class="thumbs">${days.slice(0, 4).map(d => shot(d.stops[0].img, 70, 70) || `<span class="ph"></span>`).join('')}</span>`;

  function groupPanel() {
    const pct = (LEAD.net / LEAD.party) * 100;
    return `<section class="pl-panel k-group ${S.panels.group ? 'open' : ''}">
      ${panelHead('group', 'seal', 'The group’s answer', 'users', 'Top of the list', '1 in the running · ranked by how many of you would go',
        `<button class="btn btn-ghost btn-sm">${g('sparkles')}<span class="lbl">Re-plan</span></button><button class="btn btn-ghost btn-sm">${g('plus')}<span class="lbl">Add list to trip plan</span></button>`)}
      <div class="pl-digest"><span class="badge">${g('voted')}<b>1</b> in the running</span><span class="badge">${g('users')}<b>1</b> of 14 voted</span>${thumbs([{ stops: [LEAD] }])}</div>
      <div class="pl-pb">
        <div class="pl-lb"><div class="pl-lbrow" style="--pct:${pct}%">
          <span class="rk">1</span><span class="ph">${shot(LEAD.img, 90, 90)}</span>
          <span class="nm">${LEAD.nm}${LEAD.you ? ' <span class="you">· you liked</span>' : ''}<small>${LEAD.meta}</small></span>
          <span class="tl">${LEAD.net} of ${LEAD.party}</span></div></div>
        <div class="progress">
          <div class="ptop"><span>${g('users', 'ico')} <b>1</b> of 14 have voted</span><span>${Math.round(pct)}%</span></div>
          <div class="ptrack"><div class="pfill" style="width:${pct}%"></div></div>
        </div>
      </div></section>`;
  }
  function scoutPanel() {
    const t = totals(scoutDays);
    return `<section class="pl-panel k-scout ${S.panels.scout ? 'open' : ''}">
      ${panelHead('scout', 'sparkles', 'Scout · proposal', 'sparkles', 'Scout’s plan', `${t.days} day routed from the group’s votes · ~${money(t.pp)}/person all in`,
        `<button class="btn btn-ghost btn-sm">${g('route')}<span class="lbl">Re-route</span></button><button class="btn btn-primary btn-sm">${g('plus')}<span class="lbl">Add to trip plan</span></button>`)}
      <div class="pl-digest"><span class="badge">${g('route')}<b>${t.days}</b> day</span><span class="badge">${g('wallet')}<b>${money(t.pp)}</b> pp</span>${thumbs(scoutDays)}</div>
      <div class="pl-pb">${scoutDays.map((d, i) => day(d, 'scout', i, S.open)).join('')}</div>
    </section>`;
  }
  function minePanel() {
    const t = totals(mineDays);
    return `<section class="pl-panel k-mine ${S.panels.mine ? 'open' : ''}">
      ${panelHead('mine', 'bookmark', 'Private to you', 'bookmark', 'My plan', `${t.acts} activities over ${t.days} days · share link works for 7 more days`,
        `<button class="btn btn-ghost btn-sm">${g('edit')}<span class="lbl">Change picks · 4</span></button><button class="btn btn-ghost btn-sm">${g('print')}<span class="lbl">PDF</span></button><button class="btn btn-primary btn-sm" data-open-modal>${g('link')}<span class="lbl">Share my plan</span></button>`)}
      <div class="pl-digest"><span class="badge">${g('route')}<b>${t.days}</b> days</span><span class="badge">${g('clock')}<b>${t.acts}</b> activities</span><span class="badge">${g('wallet')}<b>${money(t.pp)}</b> pp total</span>${thumbs(mineDays)}</div>
      <div class="pl-pb">
        ${mineDays.map((d, i) => day(d, 'mine', i, S.open)).join('')}
        <div class="pl-planfoot">
          <span class="tot">${g('wallet')}<b>${money(t.pp)}</b> per person across ${t.days} days</span>
          <span class="sp"></span>
          <span>Only you can see this until you share it.</span>
        </div>
      </div></section>`;
  }

  /* ---------------- modal ---------------- */
  function modal() {
    const t = totals(mineDays);
    const pills = mineDays.map((d, i) => `<button class="pl-pill ${S.modalOpen.has(key('m', i)) ? 'on' : ''}" data-jump="${i}"><span class="wd">${d.wd}</span><span class="dn">${d.dn.replace('Aug ', '')}</span></button>`).join('');
    return `<div class="pl-scrim ${S.modal ? 'show' : ''}" data-close-modal></div>
    <div class="pl-modal ${S.modal ? 'show' : ''}" role="dialog" aria-modal="true" aria-label="Your plan">
      <header class="pl-mh">
        <span class="mk">${g('sparkles')}</span>
        <span class="hh"><div class="t">Your plan</div><div class="s">Yours to keep or throw away — the group only sees it if you share it.</div></span>
        <button class="pl-x" data-close-modal aria-label="Close">${g('close')}</button>
      </header>
      <div class="pl-strip">
        ${pills}
        <span class="sp"></span>
        <button class="btn btn-ghost btn-sm" data-expand-modal>${g('route')}<span class="lbl">${S.modalOpen.size === mineDays.length ? 'Collapse all' : 'Expand all'}</span></button>
      </div>
      <div class="pl-mbody">${mineDays.map((d, i) => day(d, 'm', i, S.modalOpen)).join('')}</div>
      <footer class="pl-mfoot">
        <button class="btn btn-ghost btn-sm">${g('sparkles')}<span class="lbl">Try again</span></button>
        <span class="note">${g('clock')} Link works for 7 more days</span>
        <span class="sp"></span>
        <button class="btn btn-ghost btn-sm">${g('link')}<span class="lbl">Copy link</span></button>
        <button class="btn btn-ghost btn-sm">${g('print')}<span class="lbl">PDF</span></button>
        <button class="btn btn-primary btn-sm" data-close-modal>Done</button>
      </footer>
    </div>`;
  }

  /* ---------------- render ---------------- */
  function render() {
    const t = totals(mineDays);
    document.getElementById('app').innerHTML = `
    <div class="pl-shell">
      <header class="pl-head">
        <div>
          <h1>Things to do</h1>
          <div class="sub">near Los Angeles · vote for what you’d actually do — booking happens on Airbnb</div>
        </div>
        <span class="sp"></span>
        <div class="pl-seg">
          <button class="${S.density === 'compact' ? 'on' : ''}" data-density="compact">Compact</button>
          <button class="${S.density === 'full' ? 'on' : ''}" data-density="full">Full</button>
        </div>
        <button class="btn btn-ghost btn-sm" data-open-modal>${g('link')} Open plan modal</button>
      </header>
      ${groupPanel()}
      ${scoutPanel()}
      ${minePanel()}
    </div>
    ${modal()}`;
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', e => {
    /* explicit actions win over the row/panel toggles they sit inside */
    if (e.target.closest('[data-open-modal]')) { S.modal = true; return render(); }
    if (e.target.closest('[data-close-modal]')) { S.modal = false; return render(); }
    if (e.target.closest('[data-expand-modal]')) {
      if (S.modalOpen.size === mineDays.length) S.modalOpen.clear();
      else mineDays.forEach((_, i) => S.modalOpen.add(key('m', i)));
      return render();
    }
    const j = e.target.closest('[data-jump]');
    if (j) { const i = +j.getAttribute('data-jump'); const k = key('m', i); S.modalOpen.has(k) ? S.modalOpen.delete(k) : S.modalOpen.add(k); return render(); }
    const dens = e.target.closest('[data-density]');
    if (dens) {
      S.density = dens.getAttribute('data-density');
      S.open.clear();
      if (S.density === 'full') { mineDays.forEach((_, i) => S.open.add(key('mine', i))); scoutDays.forEach((_, i) => S.open.add(key('scout', i))); }
      else { S.open.add('mine-0'); S.open.add('scout-0'); }
      return render();
    }
    /* inert controls inside a header shouldn't collapse the panel */
    if (e.target.closest('[data-stop]')) { e.stopPropagation(); return; }

    const d = e.target.closest('[data-toggle-day]');
    if (d) {
      const k = d.getAttribute('data-toggle-day');
      const set = k.startsWith('m-') ? S.modalOpen : S.open;
      set.has(k) ? set.delete(k) : set.add(k);
      return render();
    }
    const p = e.target.closest('[data-toggle-panel]');
    if (p) { const k = p.getAttribute('data-toggle-panel'); S.panels[k] = !S.panels[k]; return render(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modal) { S.modal = false; render(); } });

  render();
  window.__planState = S;
})();
