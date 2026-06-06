import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TourStep {
  /** CSS selector for the element to spotlight (first match). */
  target: string;
  title: string;
  body: string;
}

const TIP_W = 340;
const PAD = 8;

/** Lightweight coachmark tour — dims the screen and spotlights one real element
 *  at a time with a tooltip (Back / Next / Skip). Purely visual highlight
 *  (pointer-events pass through), keyboard-navigable, reduced-motion friendly. */
export function GuidedTour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => { if (open) setI(0); }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const step = steps[i];
    const el = step ? (document.querySelector(step.target) as HTMLElement | null) : null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const t = window.setTimeout(update, 360);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.clearTimeout(t); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, i, steps]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, steps.length, onClose]);

  if (!open || steps.length === 0) return null;
  const step = steps[i];
  const last = i === steps.length - 1;
  const vw = window.innerWidth, vh = window.innerHeight;
  const below = rect ? rect.bottom + 200 < vh : true;
  const tipLeft = rect ? Math.min(Math.max(12, rect.left + rect.width / 2 - TIP_W / 2), vw - TIP_W - 12) : vw / 2 - TIP_W / 2;

  const tipStyle: React.CSSProperties = rect
    ? below
      ? { left: tipLeft, top: rect.bottom + 14 }
      : { left: tipLeft, bottom: vh - rect.top + 14 }
    : { left: vw / 2 - TIP_W / 2, top: vh / 2 - 90 };

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div
          className="tour-spot"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      ) : (
        <div className="tour-scrim-full" />
      )}
      <div className="tour-tip" style={tipStyle}>
        <div className="tt-step">Step {i + 1} of {steps.length}</div>
        <h4 className="tt-title">{step.title}</h4>
        <p className="tt-body">{step.body}</p>
        <div className="tt-foot">
          <button className="tt-skip" onClick={onClose}>Skip tour</button>
          <div className="tt-nav">
            {i > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setI((x) => x - 1)}>Back</button>}
            <button className="btn btn-primary btn-sm" onClick={() => (last ? onClose() : setI((x) => x + 1))}>
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
