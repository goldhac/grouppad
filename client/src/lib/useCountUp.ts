import { useEffect, useRef, useState } from 'react';

/** Counts a number up from 0 → target with an ease-out-cubic curve.
 *  Honors prefers-reduced-motion (snaps to the target instantly). */
export function useCountUp(target: number | null | undefined, duration = 850): number {
  const safe = target ?? 0;
  const [val, setVal] = useState(safe);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !safe) { setVal(safe); return; }
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setVal(Math.round(safe * ease(p)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [safe, duration]);

  return val;
}
