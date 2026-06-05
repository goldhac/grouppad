import { cn } from '@/lib/cn';

/**
 * The GroupPad brand mark (from the Figma Brand Mark Kit) — a rounded house with
 * the gold "decision" dot. Outline inherits `currentColor` (adapts to theme); the
 * dot is always the gold signal. `withWord` appends the Fraunces wordmark.
 */
export function PeakLogo({
  size = 22,
  withWord = false,
  className,
}: {
  size?: number;
  withWord?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 360 360"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <path d="M67.5 187.5 L180 90 L292.5 187.5" stroke="currentColor" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M99 165 V276 H261 V165" stroke="currentColor" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="180" cy="220.5" r="24" fill="var(--gold-dot)" />
      </svg>
      {withWord && (
        <span
          className="font-brand text-[19px] font-semibold leading-none tracking-[-0.02em] text-text"
          style={{ fontVariationSettings: '"SOFT" 0, "WONK" 1' }}
        >
          GroupPad
        </span>
      )}
    </span>
  );
}
