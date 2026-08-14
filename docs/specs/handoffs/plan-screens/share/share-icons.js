/* GroupPad — signature icons, ITINERARY extension.
   Same spec as icons/icons.js: 24px viewBox, ~20px live area, stroke 1.75,
   round caps/joins, stroke=currentColor. Gold dot ONLY on decision icons.
   Drawn for this product — no stock/generic glyphs.
   REQUIRES icons/icons.js first: the five glyphs that already live in the
   canonical registry are ALIASED here, never re-drawn. */
window.GP_TRAVEL = (function () {
  const S = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="gpi" aria-hidden="true">${inner}</svg>`;
  const GOLD = '#D7A12E';
  const dot = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" stroke="none"/>`;

  /* canonical registry — single source of truth for anything already in it */
  const REG = (window.GP_ICONS && window.GP_ICONS.ICONS) || {};
  const from = k => (REG[k] && REG[k].svg) || '';

  const I = {
    /* — movement — */
    drive: S(`<path d="M3.2 14.6 h17.6"/><path d="M4.6 14.6 l1.9-5.1 a2 2 0 0 1 1.87-1.3 h7.26 a2 2 0 0 1 1.87 1.3 l1.9 5.1"/><path d="M4.2 14.6 v3.1"/><path d="M19.8 14.6 v3.1"/><circle cx="7.4" cy="17.7" r="1.5"/><circle cx="16.6" cy="17.7" r="1.5"/><path d="M8.9 17.7 h6.2"/>`),
    walk: S(`<circle cx="13.1" cy="4.6" r="1.9"/><path d="M12.4 8.2 l-2.6 1.5 -1.5 3.4"/><path d="M12.4 8.2 a2 2 0 0 1 2.5 1.2 l1.1 2.8 l2.4 1.2"/><path d="M13.2 11.4 l-1 4 2.4 4.2"/><path d="M12.2 15.4 l-3.4 4.2"/>`),
    route: S(`<circle cx="6" cy="6.4" r="2.3"/><circle cx="18" cy="17.6" r="2.3"/><path d="M8.3 6.4 h5.2 a3.4 3.4 0 0 1 0 6.8 h-3.6 a3.4 3.4 0 0 0 0 6.8"/>`),

    /* — time — */
    clock: S(`<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4 V12 l3.2 2"/>`),
    sunrise: S(`<path d="M3.4 18.6 H20.6"/><path d="M7.2 18.6 a4.8 4.8 0 0 1 9.6 0"/><path d="M12 5.2 V2.8"/><path d="M5.9 7.5 L4.4 6"/><path d="M18.1 7.5 L19.6 6"/><path d="M2.9 14.6 H1.4"/><path d="M22.6 14.6 H21.1"/>`),
    sunset: S(`<path d="M3.4 18.6 H20.6"/><path d="M7.2 18.6 a4.8 4.8 0 0 1 9.6 0"/><path d="M12 2.8 V5.2"/><path d="M9.6 4.2 L12 6.6 L14.4 4.2"/><path d="M2.9 14.6 H1.4"/><path d="M22.6 14.6 H21.1"/>`),
    moon: S(`<path d="M19.4 15.4 A8.2 8.2 0 0 1 8.6 4.6 A8.4 8.4 0 1 0 19.4 15.4 Z"/>`),

    /* — places — */
    house: S(`<path d="M4.5 12.5 L12 6 L19.5 12.5"/><path d="M6.6 11 V18.4 H17.4 V11"/>`),
    coffee: S(`<path d="M4.6 6.4 h11.2 v5.6 a5.6 5.6 0 0 1 -11.2 0 Z"/><path d="M15.8 7.6 h1.9 a2.5 2.5 0 0 1 0 5 h-1.9"/><path d="M3.6 19.4 h13.2"/>`),
    dine: S(`<path d="M6.4 3.6 V10 a2.4 2.4 0 0 0 4.8 0 V3.6"/><path d="M8.8 10 V20.4"/><path d="M16.6 3.6 c-1.7 1.4 -2.4 3.2 -2.4 5.4 c0 1.6 .8 2.6 2.4 2.8 V20.4"/>`),
    ticket: S(`<path d="M3.4 8.4 a2 2 0 0 0 0 7.2 V18 h17.2 v-2.4 a2 2 0 0 1 0-7.2 V6 H3.4 Z"/><path d="M10.4 8.9 v6.2"/>`),
    camera: S(`<path d="M3.4 8.6 h3.8 l1.4-2.2 h6.8 l1.4 2.2 h3.8 v9.8 H3.4 Z"/><circle cx="12" cy="13.4" r="3.1"/>`),
    trail: S(`<path d="M3.2 20 c3.4 -1.6 4.2 -5 3.2 -7.4 c-.8 -2 -2.2 -2.8 -1.4 -4.6"/><path d="M20.8 20 c-3.4 -1.6 -4.2 -5 -3.2 -7.4 c.8 -2 2.2 -2.8 1.4 -4.6"/><path d="M12 20 V15"/><path d="M12 15 L9.4 11.8"/><path d="M12 12.6 L14.6 9.4"/><path d="M12 9.6 V5"/>`),
    museum: S(`<path d="M3.4 9.6 L12 4.4 L20.6 9.6"/><path d="M4.8 9.6 V18"/><path d="M9.6 9.6 V18"/><path d="M14.4 9.6 V18"/><path d="M19.2 9.6 V18"/><path d="M3.2 20 H20.8"/>`),
    skyline: S(`<path d="M3.2 20 V11.4 h4.6 V20"/><path d="M7.8 20 V6.6 h5.4 V20"/><path d="M13.2 20 V13.2 h3.4 V20"/><path d="M16.6 20 V9.4 h4.2 V20"/><path d="M2.6 20 H21.4"/>`),

    /* — from the canonical registry (aliases, NOT copies) — */
    users: from('users'),
    sparkles: from('sparkles'),

    /* — money / meta — */
    wallet: S(`<path d="M3.6 7.6 a2 2 0 0 1 2-2 h11.4 a2 2 0 0 1 2 2 v1.4"/><path d="M3.6 7.6 V17 a2 2 0 0 0 2 2 h13.4 a1.6 1.6 0 0 0 1.6-1.6 v-6.2 a1.6 1.6 0 0 0-1.6-1.6 H5.6 a2 2 0 0 1-2-2 Z"/><circle cx="16.6" cy="14.3" r="1.15" fill="currentColor" stroke="none"/>`),

    /* — actions — */
    download: S(`<path d="M12 3.6 V14.4"/><path d="M8.2 11 L12 14.8 L15.8 11"/><path d="M4.4 17.2 v1.4 a1.8 1.8 0 0 0 1.8 1.8 h11.6 a1.8 1.8 0 0 0 1.8-1.8 v-1.4"/>`),
    print: S(`<path d="M7 8.2 V3.8 h10 v4.4"/><path d="M7 16.6 H4.8 a1.6 1.6 0 0 1-1.6-1.6 v-5.2 a1.6 1.6 0 0 1 1.6-1.6 h14.4 a1.6 1.6 0 0 1 1.6 1.6 v5.2 a1.6 1.6 0 0 1-1.6 1.6 H17"/><path d="M7 13.4 h10 v6.8 H7 Z"/>`),
    plus: S(`<path d="M12 5.4 V18.6"/><path d="M5.4 12 H18.6"/>`),
    arrow: S(`<path d="M4.6 12 H19.4"/><path d="M14.2 6.8 L19.4 12 L14.2 17.2"/>`),
    chev: S(`<path d="M9.6 5.8 L15.8 12 L9.6 18.2"/>`),
    close: S(`<path d="M6.4 6.4 L17.6 17.6"/><path d="M17.6 6.4 L6.4 17.6"/>`),
    link: S(`<path d="M10.4 13.6 a3.6 3.6 0 0 0 5.1 0 l2.9-2.9 a3.6 3.6 0 0 0-5.1-5.1 L11.8 7.2"/><path d="M13.6 10.4 a3.6 3.6 0 0 0-5.1 0 l-2.9 2.9 a3.6 3.6 0 0 0 5.1 5.1 L12.2 16.8"/>`),
    edit: S(`<path d="M4.4 19.6 h4.2 L19.2 9 a2.3 2.3 0 0 0-3.2-3.2 L5.4 16.4 Z"/><path d="M14.6 7.2 L17.8 10.4"/>`),

    /* — day / plan marks (NOT decisions — no gold dot) — */
    flag: S(`<path d="M6 20.4 V4.2"/><path d="M6 5 h11.4 l-2.1 4.2 2.1 4.2 H6"/>`),
    bookmark: S(`<path d="M6.4 3.8 h11.2 v16.4 L12 15.8 L6.4 20.2 Z"/>`),

    /* — decision (gold) — aliased from the registry so the gold-dot rule has
         exactly one owner. `house` below is deliberately NOT `peak`: same form,
         gold dot dropped, because a location is not a decision. */
    seal: from('official-pick'),
    voted: from('vote-up'),
    pinned: from('pin'),
  };

  /* the brand monogram, used as seal + image fallback */
  const MARK = (s, gold) => `<svg viewBox="0 0 56 56" width="${s}" height="${s}" aria-hidden="true"><path d="M14 31 L28 17 L42 31" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 29 V41 H38 V29" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="28" cy="35" r="3.2" fill="${gold ? GOLD : 'currentColor'}"/></svg>`;

  return { I, MARK, GOLD };
})();
