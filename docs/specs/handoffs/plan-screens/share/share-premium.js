/* ============================================================================
   GroupPad — SHARED PLAN (public link) · renderer
   Read-only, self-contained, print-safe. Icons come from share/share-icons.js
   (signature set) — no stock glyphs, no emoji.
   ============================================================================ */
(function () {
  const T = window.GP_TRAVEL;
  const g = (name, cls) => `<span class="${cls || 'g'}">${T.I[name] || ''}</span>`;
  const IMG = (id, w, h) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=80&auto=format`;
  const money = n => '$' + n.toLocaleString('en-US');

  const PLAN = {
    author: 'Gold', initial: 'G',
    place: 'Los Angeles',
    trip: 'Los Angeles Group Trip',
    dates: 'Aug 18–23, 2026',
    party: 14,
    hero: '1534190760961-74e8c1c5c3da',
    daysPlanned: 1, daysTotal: 6,
    out: '7 hr 35 min', driving: '2 hr 5 min', pp: 76,
    days: [{
      n: 'Day one', date: 'Tuesday, Aug 18', arc: '9:30a – 5:05p',
      out: '7 hr 35 min', driving: '2 hr 5 min', pp: 76,
      items: [
        { k: 'anchor', t: '9:30a', icon: 'house', nm: 'The house', sub: 'everyone out the door' },
        { k: 'leg', mode: 'drive', dur: '~45 min', mi: '26.3 mi', aside: 'a long haul — this one costs you most of a morning', long: true },
        { k: 'detour', nm: 'The World-Famous Studio Tour', note: 'right on the way, if you leave early', img: '1489599849927-2ee91cede3ba' },
        { k: 'stop', t: '10:15a', nm: 'Hike to the Hollywood Sign with comics and canines',
          dur: '1 hr 30 min', pp: 17, tag: 'voted', img: '1580655653885-65763b2597d0',
          why: 'The trail faces east, so a mid-morning start keeps the sun behind you — and the lot is still half empty at quarter past ten.' },
        { k: 'leg', mode: 'drive', dur: '~25 min', mi: '10.6 mi', aside: 'down out of the hills, straight into downtown' },
        { k: 'detour', nm: 'Chinese American Museum', note: 'two blocks off the route', img: '1544967082-d9d25d867d66' },
        { k: 'stop', t: '12:10p', nm: 'Los Angeles: Little Tokyo, Murals and Skyline',
          dur: '4 hr', pp: 59, tag: 'voted', img: '1515896769750-31548aa180ed',
          why: 'Four hours is the whole afternoon, so it goes last — you finish downtown with the skyline starting to light up.' },
        { k: 'gap', txt: 'Nothing after 4:10p — the group hasn’t voted on an evening yet' },
        { k: 'leg', mode: 'drive', dur: '~55 min', mi: '36.6 mi', aside: 'back to the house' },
        { k: 'anchor', t: '5:05p', icon: 'house', nm: 'The house', sub: 'home for the night' },
      ],
    }],
  };

  /* ---------- rows ---------- */
  function time(t) {
    const m = String(t).match(/^(\d{1,2}:\d{2})([ap])$/);
    return m ? `${m[1]}<span class="mer">${m[2]}m</span>` : t;
  }
  function row(cls, t, node, inner) {
    return `<div class="sp-row ${cls}">
      <div class="t">${t ? time(t) : ''}</div>
      <div class="rail"><span class="node">${node}</span></div>
      <div class="c">${inner}</div>
    </div>`;
  }
  const shot = (id, w, h, cls) => id
    ? `<img src="${IMG(id, w, h)}" alt="" loading="lazy" onerror="this.remove()"/>`
    : '';

  function stop(it) {
    const tag = it.tag === 'voted' ? `<span class="sp-tag voted">${g('voted')} Voted in</span>`
      : it.tag === 'pinned' ? `<span class="sp-tag pinned">${g('pinned')} Pinned</span>`
      : it.tag === 'added' ? `<span class="sp-tag added">${g('sparkles')} Scout added</span>` : '';
    const facts = [
      it.dur ? `<span class="f">${g('clock')}${it.dur}</span>` : '',
      it.pp != null ? `<span class="f money">${g('wallet')}${money(it.pp)} per person</span>` : '',
    ].filter(Boolean).join('<span class="div"></span>');
    return `<div class="sp-stop">
      <div class="shotwrap"><span class="fb">${T.MARK(22)}</span>${shot(it.img, 320, 240)}</div>
      <div class="body">
        <div class="nm">${it.nm}${tag}</div>
        ${facts ? `<div class="sp-facts">${facts}</div>` : ''}
        ${it.why ? `<p class="sp-why">${it.why}</p>` : ''}
      </div></div>`;
  }
  const anchor = it => `<div class="sp-anchor">${g(it.icon || 'house')}<span class="nm">${it.nm}</span><span class="sub">· ${it.sub}</span></div>`;
  const leg = it => `<div class="sp-leg"><span class="dur">${it.dur} ${it.mode}</span><span class="mi">· ${it.mi}</span>${it.aside ? `<span class="aside">— ${it.aside}</span>` : ''}</div>`;
  const detour = it => `<div class="sp-detour">
      <span class="thumb">${shot(it.img, 140, 120)}</span>
      <span class="txt"><span class="k caps">Optional detour</span><span class="nm">${it.nm}</span></span>
      <span class="aside" style="font-size:12px;font-style:italic;color:var(--text-muted)">${it.note}</span>
      <span class="add">${g('plus')}<span class="lbl">Add</span></span>
    </div>`;
  const gap = it => `<div class="sp-gap"><span class="txt">${it.txt}</span><span class="line"></span></div>`;

  function day(d) {
    const rows = d.items.map((it, i) => {
      const cls = [it.k === 'leg' ? 'leg' : '', it.long ? 'long' : '', i === 0 ? 'first' : '', i === d.items.length - 1 ? 'last' : ''].filter(Boolean).join(' ');
      if (it.k === 'leg') return row(cls, '', `<span class="leg-glyph">${g(it.mode === 'walk' ? 'walk' : 'drive')}</span>`, leg(it));
      if (it.k === 'anchor') return row(cls, it.t, '<span class="dot-anchor"></span>', anchor(it));
      if (it.k === 'detour') return row(cls, '', '<span class="dot-detour"></span>', detour(it));
      if (it.k === 'gap') return row(cls, '', '<span class="dot-detour"></span>', gap(it));
      return row(cls, it.t, '<span class="dot-stop"></span>', stop(it));
    }).join('');
    return `<section class="sp-day">
      <header class="sp-dayhead">
        <span class="sp-daynum">${d.n}</span>
        <h2 class="sp-daydate">${d.date}</h2>
        <span class="sp-dayrule"></span>
        <span class="sp-dayarc">${g('sunrise')}${d.arc}</span>
      </header>
      ${rows}
      <div class="sp-wrap">
        <span class="seal">${g('seal')}</span>
        <span class="lab">That’s a wrap for ${d.date.split(',')[0]}</span>
        <span class="figs"><span><b>${d.out}</b> out</span><span><b>${d.driving}</b> driving</span><span><b>${money(d.pp)}</b> per person</span></span>
      </div>
    </section>`;
  }

  function ledger(p) {
    const cell = (icon, k, v, unit, accent) => `<div class="cell ${accent ? 'accent' : ''}">
      <div class="k caps">${k}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div></div>`;
    return `<div class="sp-ledger">
      ${cell('route', 'Planned', p.daysPlanned, `of ${p.daysTotal} days`)}
      ${cell('clock', 'Out of the house', p.out, '')}
      ${cell('drive', 'Behind the wheel', p.driving, '')}
      ${cell('wallet', 'Per person', money(p.pp), 'all in', true)}
    </div>`;
  }

  function render() {
    const p = PLAN;
    document.getElementById('app').innerHTML = `
    <div class="sp-stage">
      <article class="sp">

        <header class="sp-hero">
          <div class="shot"><span class="fallback">${T.MARK(72)}</span><img src="${IMG(p.hero, 1600, 1000)}" alt="Los Angeles" onerror="this.remove()"/></div>

          <div class="sp-top">
            <span class="sp-brand"><span class="mk">${T.MARK(26, true)}</span><span class="wm">GroupPad</span></span>
            <span class="sp-spacer"></span>
            <button class="sp-act" data-print>${g('download')}<span class="lbl">Download PDF</span></button>
            <button class="sp-act" data-print>${g('print')}<span class="lbl">Print</span></button>
          </div>

          <div class="sp-title">
            <span class="sp-byline caps"><span class="rule"></span>${p.author}’s idea — not the group’s decision</span>
            <h1 class="sp-h1"><span class="of">${p.author}’s plan for</span>${p.place}</h1>
            <div class="sp-sub">
              <span class="who"><span class="av">${p.initial}</span>${p.trip}</span>
              <span class="pip"></span><span>${p.dates}</span>
              <span class="pip"></span><span>${p.party} travelling</span>
            </div>
          </div>
        </header>

        ${ledger(p)}

        <div class="sp-days">${p.days.map(day).join('')}</div>

        <div class="sp-close">
          <div class="sp-cta">
            <span class="mk">${T.MARK(34, true)}</span>
            <h2>This is one person’s idea. Yours is a board away.</h2>
            <p>Open the trip, vote on what you’d actually do, and let the group’s plan build itself — drives, timings and all.</p>
            <button class="sp-btn">${g('arrow')} Open the board &amp; build your own plan</button>
            <div class="sp-fine">
              <span>Made with GroupPad</span><span class="pip"></span>
              <span>Booking happens on Airbnb</span><span class="pip"></span>
              <span>Times and drives are estimates</span>
            </div>
          </div>
        </div>

      </article>
    </div>`;
  }

  document.addEventListener('click', e => {
    if (e.target.closest('[data-print]')) window.print();
  });

  render();
})();
