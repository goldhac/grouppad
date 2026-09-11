import { useCallback, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';

/**
 * The behaviour a bottom sheet has to have before it's allowed to look like one.
 *
 * The phone sheets were drawing a grabber — the HIG's signal that a sheet can be
 * dragged — while supporting no drag at all, and declaring `aria-modal` while
 * trapping no focus. Both are claims made in the interface language people
 * already read, so both have to be true:
 *
 *  · "Support swiping to dismiss a sheet. People expect to swipe vertically to
 *     dismiss a sheet instead of tapping a dismiss button."
 *     — components/presentation/sheets.md
 *  · "Include a grabber in a resizable sheet … a grabber also works with
 *     VoiceOver" — same article. A grabber over a dead sheet is the case the
 *     gestures article warns about: the gesture fails silently and people
 *     conclude the app has frozen.
 *
 * The drag only engages when the sheet's own scroller is already at the top.
 * Otherwise a flick upward through a long filter list would fight the dismiss,
 * and the sheet would jitter instead of scrolling.
 */

const DISMISS_PX = 96;      // far enough that a scroll overshoot never dismisses
const DISMISS_VELOCITY = 0.5; // px/ms — a fast flick dismisses from anywhere

export function useSheet(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number; on: boolean }>({ y: 0, t: 0, on: false });

  // Escape + focus containment + focus restoration, all three.
  useFocusTrap(ref, open, onClose);

  const atTop = (target: EventTarget | null) => {
    let el = target as HTMLElement | null;
    while (el && ref.current?.contains(el)) {
      if (el.scrollHeight > el.clientHeight + 1) return el.scrollTop <= 0;
      el = el.parentElement;
    }
    return true;
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;          // a mouse drags nothing here
    if (!atTop(e.target)) return;
    drag.current = { y: e.clientY, t: Date.now(), on: true };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const d = e.clientY - drag.current.y;
    // Upward drag does nothing: this sheet has one detent, so there is no
    // taller state to drag it into. Pretending otherwise is the same lie the
    // grabber was telling.
    setDy(d > 0 ? d : 0);
  }, []);

  const end = useCallback((e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const d = e.clientY - drag.current.y;
    const v = d / Math.max(1, Date.now() - drag.current.t);
    drag.current.on = false;
    if (d > DISMISS_PX || (d > 24 && v > DISMISS_VELOCITY)) { setDy(0); onClose(); }
    else setDy(0);                                   // spring back
  }, [onClose]);

  return {
    ref,
    /** Spread on the sheet element. */
    sheet: {
      ref,
      tabIndex: -1,                                  // so focus can land on it
      onPointerDown, onPointerMove,
      onPointerUp: end, onPointerCancel: end,
      style: dy
        ? { transform: `translateY(${dy}px)`, transition: 'none' as const }
        : undefined,
    },
    dragging: dy > 0,
  };
}
