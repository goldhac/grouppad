import { useEffect, useRef, useState } from 'react';

/** A money figure that ticks up (ease-out-cubic) the first time it scrolls into
 *  view — for the signature per-person number on the landing page. Honors
 *  reduced-motion (snaps to the value) and only ever animates once. */
export function MoneyCount({ value, durationMs = 950, className }: { value: number; durationMs?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(value); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(value); return; }
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || started.current) return;
      started.current = true;
      io.disconnect();
      let start: number | null = null;
      const tick = (ts: number) => {
        if (start == null) start = ts;
        const p = Math.min(1, (ts - start) / durationMs);
        setShown(Math.round(value * ease(p)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [value, durationMs]);

  return <span ref={ref} className={className}>${shown.toLocaleString('en-US')}</span>;
}
