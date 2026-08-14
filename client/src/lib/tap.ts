import { useRef } from 'react';

/**
 * Only act on a tap that was meant.
 *
 * On a phone, a card's `onClick` fires for three gestures that are not taps:
 * the finger that lands mid-flick to stop momentum, the one that lands and then
 * drags into a scroll, and the one that lifts a beat after a scroll settles.
 * All three open a detail sheet nobody asked for, which is what "it almost
 * selects the image when I'm scrolling" describes.
 *
 * The fix is a deliberateness test, not a long press. Requiring a long press to
 * open a card would tax the 95% of taps that ARE intentional in order to stop
 * the 5% that aren't; a tap should stay a tap. So we ignore a click when any of
 * these is true:
 *
 *   · the finger travelled more than a thumb's wobble (that was a scroll)
 *   · the press was held long enough to be a press-and-hold, not a tap
 *   · the list was scrolling moments ago (that was a momentum stop)
 *
 * The movement threshold is deliberately generous. A real tap on a 44px target
 * rarely wanders past ~10px, while the smallest gesture anyone reads as a swipe
 * clears it immediately.
 */

const SLOP_PX = 10;
const MAX_HOLD_MS = 700;
/** How long after a scroll a tap is still assumed to be a momentum stop. */
const SETTLE_MS = 220;

let lastScrollAt = 0;

/** Call from the scroll container's `onScroll`. Cheap on purpose — it runs on
 *  every scroll frame, so it does one assignment and nothing else. */
export function markScrolling() { lastScrollAt = Date.now(); }

export function isSettling(now = Date.now()) { return now - lastScrollAt < SETTLE_MS; }

type Pt = { x: number; y: number; t: number; ok: boolean };

/** The whole decision, as a pure function so it can be tested without a DOM. */
export function isDeliberateTap(o: {
  moved: boolean;        // finger travelled past the slop
  heldMs: number;        // press duration
  settling: boolean;     // the list was scrolling moments ago
  hadGesture: boolean;   // false for keyboard / assistive-tech clicks
}) {
  if (!o.hadGesture) return true;
  return !o.moved && !o.settling && o.heldMs <= MAX_HOLD_MS;
}

export const TAP_TUNING = { SLOP_PX, MAX_HOLD_MS, SETTLE_MS };

/**
 * One hook instance serves every card on the screen: `bind(onTap)` returns the
 * props to spread. There is only ever one pointer mid-gesture, so the state is
 * per-pointer rather than per-card — and a hook can't be called inside a render
 * loop anyway.
 *
 *   const tap = useDeliberateTap();
 *   …
 *   <article {...tap.bind(() => open(item))}>
 */
export function useDeliberateTap() {
  const down = useRef<Pt>({ x: 0, y: 0, t: 0, ok: false });

  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY, t: Date.now(), ok: true };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = down.current;
    if (!d.ok) return;
    if (Math.abs(e.clientX - d.x) > SLOP_PX || Math.abs(e.clientY - d.y) > SLOP_PX) d.ok = false;
  };
  // A pointer the scroller steals mid-gesture is never a tap.
  const onPointerCancel = () => { down.current.ok = false; };

  return {
    bind(onTap: (e: React.MouseEvent) => void) {
      return {
        onPointerDown, onPointerMove, onPointerCancel,
        onClick: (e: React.MouseEvent) => {
          const d = down.current;
          // A synthetic click with no pointer sequence behind it (keyboard,
          // assistive tech) has no gesture to doubt, so it passes through.
          const ok = isDeliberateTap({ moved: !d.ok, heldMs: Date.now() - d.t, settling: isSettling(), hadGesture: d.t > 0 });
          if (!ok) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onTap(e);
        },
      };
    },
  };
}
