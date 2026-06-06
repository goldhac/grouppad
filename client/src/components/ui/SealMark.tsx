import { Suspense, lazy } from 'react';
import { LockSeal } from '@/components/ui/LockSeal';

// Lazy so lottie-web (~90KB gzip) lands in its own async chunk and never bloats
// the initial landing/board load — it only downloads when a seal is shown
// (a fresh lock or onboarding slide 5). The CSS seal is the instant fallback.
const LottieLockSeal = lazy(() => import('@/components/ui/LottieLockSeal'));

/** Drop-in for the gold "make it official" seal: animated Lottie when shown,
 *  with the static CSS seal as the loading/reduced-motion fallback. */
export function SealMark({ size = 88, play = false, className = '' }: { size?: number; play?: boolean; className?: string }) {
  return (
    <Suspense fallback={<LockSeal size={size} play={false} className={className} />}>
      <LottieLockSeal size={size} play={play} className={className} />
    </Suspense>
  );
}
