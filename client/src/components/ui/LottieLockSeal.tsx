import { useEffect, useRef } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import sealData from '@/assets/lock-seal.json';
import { LockSeal } from '@/components/ui/LockSeal';

const LAST_FRAME = 95; // op is 96; 95 is the last in-range (settled) frame

function prefersReduced() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** The signature "make it official" gold seal — the real Lottie (authored in
 *  LottieFiles Creator): ambient glow → teal disc pop → gold ring → checkmark
 *  draw → notch-dot drop → spark burst. Gold is theme-independent, so it reads
 *  on both cream and charcoal.
 *
 *  `play` fires the stamp once; when false it holds the settled seal. Reduced
 *  motion falls back to the lightweight static CSS seal (no player runs). API
 *  matches LockSeal so it's a drop-in. */
export default function LottieLockSeal({ size = 88, play = false, className = '' }: { size?: number; play?: boolean; className?: string }) {
  const ref = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    if (prefersReduced()) return;
    const a = ref.current;
    if (!a) return;
    if (play) { a.setSpeed(0.55); a.goToAndPlay(0, true); }
    else a.goToAndStop(LAST_FRAME, true);
  }, [play]);

  // Reduced motion → static settled CSS seal (no Lottie player at all).
  if (prefersReduced()) {
    return <LockSeal size={size} play={false} className={className} />;
  }

  return (
    <span className={`lockseal ${className}`} style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center' }} aria-hidden>
      <Lottie
        lottieRef={ref}
        animationData={sealData}
        loop={false}
        autoplay={false}
        style={{ width: size, height: size }}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
    </span>
  );
}
