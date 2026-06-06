import { useEffect, useRef, useState } from 'react';

/** The signature "make it official" gold seal — a one-shot stamp.
 *  Three motion layers (glow → disc pop → checkmark draw + dot drop + spark
 *  burst) on the gold/lock beat. Theme-independent (gold is gold both themes).
 *
 *  Pass `play` to fire the stamp once (e.g. the moment a decision is locked).
 *  When `play` is false it renders the settled seal. Honors reduced-motion via
 *  the CSS (animations are gated; static shapes always show). */
export function LockSeal({ size = 88, play = false, className = '' }: { size?: number; play?: boolean; className?: string }) {
  // `arm` holds the pieces hidden for one frame before `play` so the stamp reads
  // as a real entrance rather than a pop-in mid-animation.
  const [phase, setPhase] = useState<'idle' | 'arm' | 'play'>(play ? 'arm' : 'idle');
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!play) { setPhase('idle'); return; }
    setPhase('arm');
    raf.current = requestAnimationFrame(() => raf.current = requestAnimationFrame(() => setPhase('play')));
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [play]);

  // six radial sparks around the disc
  const sparks = [0, 60, 120, 180, 240, 300].map((deg) => {
    const r = (deg * Math.PI) / 180;
    const cx = 50 + Math.cos(r) * 40;
    const cy = 50 + Math.sin(r) * 40;
    return { cx, cy, deg };
  });

  return (
    <span className={`lockseal ${phase} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" fill="none">
        {/* ambient glow */}
        <circle className="ls-glow" cx="50" cy="50" r="34" fill="var(--gold-dot)" opacity="0.4" />
        {/* expanding ring on impact */}
        <circle className="ls-ring" cx="50" cy="50" r="30" fill="none" stroke="var(--gold-dot)" strokeWidth="2" />
        {/* the disc */}
        <g className="ls-disc">
          <circle cx="50" cy="50" r="30" fill="var(--official, #f6efe0)" stroke="var(--gold-dot)" strokeWidth="2.5" />
          {/* checkmark */}
          <path className="ls-check" d="M38 51 L47 60 L63 42" stroke="var(--gold-dot)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {/* sparks */}
        {sparks.map((s, i) => (
          <circle key={i} className="ls-spark" cx={s.cx} cy={s.cy} r="2.4" fill="var(--gold-dot)" />
        ))}
        {/* gold notch dot, top-right */}
        <circle className="ls-dot" cx="74" cy="26" r="6.5" fill="var(--gold-dot)" stroke="var(--surface-sunken, #fff)" strokeWidth="2.5" />
      </svg>
    </span>
  );
}
