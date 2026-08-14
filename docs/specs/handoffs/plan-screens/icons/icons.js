/* GroupPad — signature icon set registry.
   Spec: 24px viewBox, ~20px live area, stroke 1.75, round caps/joins,
   stroke=currentColor. Gold dot (#D7A12E) ONLY on decision icons. */
window.GP_ICONS = (function () {
  // shared svg open/close — stroke inherits currentColor; gold dots are explicit fills
  const S = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="gpi">${inner}</svg>`;
  const GOLD = '#D7A12E';
  const dot = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" stroke="none"/>`;

  const ICONS = {
    /* — brand — */
    peak: { group: 'Brand', decision: true, svg: S(
      `<path d="M4.5 12.5 L12 6 L19.5 12.5"/><path d="M6.6 11 V18.4 H17.4 V11"/>${dot(12, 14.7, 1.5)}`) },

    /* — voting — */
    'vote-up': { group: 'Voting', svg: S(
      `<path d="M3.5 11 H6.5 V19 H3.5 Z"/><path d="M6.5 11 L9.2 5.4 a1.7 1.7 0 0 1 3 1.5 L11.4 11 H16.8 a1.7 1.7 0 0 1 1.66 2.06 l-1 4.4 A1.75 1.75 0 0 1 15.76 19 H6.5"/>`) },
    'vote-down': { group: 'Voting', svg: S(
      `<path d="M3.5 13 H6.5 V5 H3.5 Z"/><path d="M6.5 13 L9.2 18.6 a1.7 1.7 0 0 0 3-1.5 L11.4 13 H16.8 a1.7 1.7 0 0 0 1.66-2.06 l-1-4.4 A1.75 1.75 0 0 0 15.76 5 H6.5"/>`) },
    star: { group: 'Voting', svg: S(
      `<path d="M12 3.6 L14.5 8.7 L20.1 9.5 L16 13.4 L17 19 L12 16.3 L7 19 L8 13.4 L3.9 9.5 L9.5 8.7 Z"/>`) },

    /* — decision (gold dot) — */
    pin: { group: 'Decision', svg: S(
      `<circle cx="12" cy="7" r="3.1"/><path d="M9.1 9.4 L7.4 12.2 H16.6 L14.9 9.4"/><path d="M12 12.2 V20"/>`) },
    'official-pick': { group: 'Decision', decision: true, svg: S(
      `<circle cx="11" cy="13" r="8"/><path d="M7.6 13.2 L10 15.6 L14.4 10.4"/>${dot(19, 6, 1.7)}`) },
    'lock-seal': { group: 'Decision', decision: true, svg: S(
      `<path d="M6.4 11 H17.6 V20 H6.4 Z"/><path d="M8.7 11 V8 a3.3 3.3 0 0 1 6.6 0 V11"/>${dot(12, 15.2, 1.6)}`) },

    /* — roles — */
    crown: { group: 'Roles', svg: S(
      `<path d="M3.6 8.2 L7.2 12.6 L12 6 L16.8 12.6 L20.4 8.2 L18.8 18.4 H5.2 Z"/><path d="M5.2 18.4 H18.8"/>`) },

    /* — AI — */
    sparkles: { group: 'AI', svg: S(
      `<path d="M11 3.8 L12.1 9.4 L17.7 10.5 L12.1 11.6 L11 17.2 L9.9 11.6 L4.3 10.5 L9.9 9.4 Z"/><path d="M18.4 4.6 L18.9 6.9 L21.2 7.4 L18.9 7.9 L18.4 10.2 L17.9 7.9 L15.6 7.4 L17.9 6.9 Z"/>`) },
    swords: { group: 'AI', svg: S(
      `<path d="M3.5 4 L13.5 14"/><path d="M20.5 4 L10.5 14"/><path d="M14.4 13 L20 18.6 L18.6 20 L13 14.4"/><path d="M9.6 13 L4 18.6 L5.4 20 L11 14.4"/>`) },

    /* — per-person — */
    users: { group: 'People', svg: S(
      `<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19 a5.5 5.5 0 0 1 11 0"/><path d="M16 5.3 a3 3 0 0 1 0 5.7"/><path d="M17.6 13.6 a5 5 0 0 1 3.4 5"/>`) },

    /* — distance — */
    'map-pin': { group: 'Distance', svg: S(
      `<path d="M12 20.8 C12 20.8 18 15.2 18 10.2 a6 6 0 0 0-12 0 C6 15.2 12 20.8 12 20.8 Z"/><circle cx="12" cy="10.2" r="2.2"/>`) },
    plane: { group: 'Distance', svg: S(
      `<path d="M21.4 4.6 L2.6 11.1 L10 13.6 L12.5 21 Z"/><path d="M21.4 4.6 L10 13.6"/>`) },
    'ferris-wheel': { group: 'Distance', svg: S(
      `<circle cx="12" cy="11" r="6.6"/><circle cx="12" cy="11" r="1"/><path d="M12 11 V4.4"/><path d="M12 11 L17.7 7.7"/><path d="M12 11 L17.7 14.3"/><path d="M12 11 V17.6"/><path d="M12 11 L6.3 14.3"/><path d="M12 11 L6.3 7.7"/><path d="M9 20 L12 11 L15 20"/><path d="M6.8 20 H17.2"/>`) },
  };

  const LABELS = {
    peak: 'Peak logo', 'vote-up': 'Vote up', 'vote-down': 'Vote down', star: 'Star · shortlist',
    pin: 'Pin · make official', 'official-pick': 'Official pick', 'lock-seal': 'Lock · seal',
    crown: 'Crown · organizer', sparkles: 'Sparkles · AI', swords: 'Swords · 1v1',
    users: 'Users · per-person', 'map-pin': 'Map pin · downtown', plane: 'Plane · airport',
    'ferris-wheel': 'Ferris wheel · attraction',
  };

  return { ICONS, LABELS, GOLD };
})();
