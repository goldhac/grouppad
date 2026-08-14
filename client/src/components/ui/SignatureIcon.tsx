/**
 * The signature icon registry — ported verbatim from the design handoff's
 * canonical set (`docs/specs/handoffs/plan-screens/icons/icons.js`).
 *
 * Spec for anything added here: 24px viewBox, ~20px live area, stroke 1.75,
 * round caps and joins, `stroke="currentColor"`.
 *
 * THE RULE THAT MATTERS: the gold dot marks DECISIONS ONLY. `officialPick` and
 * `lockSeal` carry it because they mean the group settled something. A machine
 * proposal, a private draft and a day summary are not decisions — they use
 * `sparkles`, `bookmark` and `flag`, and those must stay gold-free or the dot
 * stops meaning anything.
 *
 * Anything already in this set must never be re-drawn inline — alias it.
 */
const GOLD = 'var(--gold-dot, #D7A12E)';

type Glyph = { d: React.ReactNode; decision?: boolean };

const G: Record<string, Glyph> = {
  /* — brand — */
  peak: {
    decision: true,
    d: <>
      <path d="M4.5 12.5 L12 6 L19.5 12.5" /><path d="M6.6 11 V18.4 H17.4 V11" />
      <circle cx="12" cy="14.7" r="1.5" fill={GOLD} stroke="none" />
    </>,
  },
  /** `peak` without the dot — a house is a place, not a decision. */
  house: { d: <><path d="M4.5 12.5 L12 6 L19.5 12.5" /><path d="M6.6 11 V18.4 H17.4 V11" /></> },

  /* — decision (gold) — */
  officialPick: {
    decision: true,
    d: <>
      <circle cx="11" cy="13" r="8" /><path d="M7.6 13.2 L10 15.6 L14.4 10.4" />
      <circle cx="19" cy="6" r="1.7" fill={GOLD} stroke="none" />
    </>,
  },
  lockSeal: {
    decision: true,
    d: <>
      <path d="M6.4 11 H17.6 V20 H6.4 Z" /><path d="M8.7 11 V8 a3.3 3.3 0 0 1 6.6 0 V11" />
      <circle cx="12" cy="15.2" r="1.6" fill={GOLD} stroke="none" />
    </>,
  },
  pin: { d: <><circle cx="12" cy="7" r="3.1" /><path d="M9.1 9.4 L7.4 12.2 H16.6 L14.9 9.4" /><path d="M12 12.2 V20" /></> },

  /* — voting — */
  voteUp: {
    d: <>
      <path d="M3.5 11 H6.5 V19 H3.5 Z" />
      <path d="M6.5 11 L9.2 5.4 a1.7 1.7 0 0 1 3 1.5 L11.4 11 H16.8 a1.7 1.7 0 0 1 1.66 2.06 l-1 4.4 A1.75 1.75 0 0 1 15.76 19 H6.5" />
    </>,
  },
  voteDown: {
    d: <>
      <path d="M3.5 13 H6.5 V5 H3.5 Z" />
      <path d="M6.5 13 L9.2 18.6 a1.7 1.7 0 0 0 3-1.5 L11.4 13 H16.8 a1.7 1.7 0 0 0 1.66-2.06 l-1-4.4 A1.75 1.75 0 0 0 15.76 5 H6.5" />
    </>,
  },
  star: { d: <path d="M12 3.6 L14.5 8.7 L20.1 9.5 L16 13.4 L17 19 L12 16.3 L7 19 L8 13.4 L3.9 9.5 L9.5 8.7 Z" /> },
  crown: { d: <><path d="M3.6 8.2 L7.2 12.6 L12 6 L16.8 12.6 L20.4 8.2 L18.8 18.4 H5.2 Z" /><path d="M5.2 18.4 H18.8" /></> },

  /* — AI — deliberately no gold: a proposal is not a decision — */
  sparkles: {
    d: <>
      <path d="M11 3.8 L12.1 9.4 L17.7 10.5 L12.1 11.6 L11 17.2 L9.9 11.6 L4.3 10.5 L9.9 9.4 Z" />
      <path d="M18.4 4.6 L18.9 6.9 L21.2 7.4 L18.9 7.9 L18.4 10.2 L17.9 7.9 L15.6 7.4 L17.9 6.9 Z" />
    </>,
  },
  swords: {
    d: <>
      <path d="M3.5 4 L13.5 14" /><path d="M20.5 4 L10.5 14" />
      <path d="M14.4 13 L20 18.6 L18.6 20 L13 14.4" /><path d="M9.6 13 L4 18.6 L5.4 20 L11 14.4" />
    </>,
  },

  /* — people / distance — */
  users: {
    d: <>
      <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19 a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.3 a3 3 0 0 1 0 5.7" /><path d="M17.6 13.6 a5 5 0 0 1 3.4 5" />
    </>,
  },
  mapPin: { d: <><path d="M12 20.8 C12 20.8 18 15.2 18 10.2 a6 6 0 0 0-12 0 C6 15.2 12 20.8 12 20.8 Z" /><circle cx="12" cy="10.2" r="2.2" /></> },
  plane: { d: <><path d="M21.4 4.6 L2.6 11.1 L10 13.6 L12.5 21 Z" /><path d="M21.4 4.6 L10 13.6" /></> },
  ferrisWheel: {
    d: <>
      <circle cx="12" cy="11" r="6.6" /><circle cx="12" cy="11" r="1" />
      <path d="M12 11 V4.4" /><path d="M12 11 L17.7 7.7" /><path d="M12 11 L17.7 14.3" />
      <path d="M12 11 V17.6" /><path d="M12 11 L6.3 14.3" /><path d="M12 11 L6.3 7.7" />
      <path d="M9 20 L12 11 L15 20" /><path d="M6.8 20 H17.2" />
    </>,
  },

  /* — itinerary — the travel set the share page already uses inline — */
  car: {
    d: <>
      <path d="M5 13l1.5-4.5A2 2 0 018.4 7h7.2a2 2 0 011.9 1.5L19 13" />
      <path d="M4 13h16v4a1 1 0 01-1 1h-1a1 1 0 01-1-1v-1H7v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-4z" />
      <circle cx="7.5" cy="15.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="15.5" r=".8" fill="currentColor" stroke="none" />
    </>,
  },
  walk: { d: <><circle cx="13" cy="4.5" r="1.6" /><path d="M11 21l1.5-5.5-2.5-2.2V9.5L13 8l2.5 2 2 1" /><path d="M10 12.5L7.5 15 6.5 21" /></> },
  /** A day summary is NOT a decision — no dot. */
  flag: { d: <><path d="M6 21V4" /><path d="M6 5h9l-1.5 3L15 11H6z" /></> },
  /** A private draft is NOT a decision — no dot. */
  bookmark: { d: <path d="M7 4h10v16l-5-3.6L7 20z" /> },
};

export type SignatureName = keyof typeof G;

/** Does this glyph carry the gold decision dot? Useful in tests/audits. */
export const isDecisionIcon = (name: SignatureName) => !!G[name]?.decision;

export function SignatureIcon({ name, className, size }: { name: SignatureName; className?: string; size?: number }) {
  const g = G[name];
  if (!g) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size} height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {g.d}
    </svg>
  );
}
