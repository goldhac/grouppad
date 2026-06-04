import { cn } from '@/lib/cn';

/**
 * The Peak brand mark — a roof/house glyph with the gold "decision" dot.
 * The outline inherits `currentColor`; the dot is always the gold signal.
 * `withWord` appends the GroupPad wordmark in the display face.
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
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        <path d="M4.5 12.5 L12 6 L19.5 12.5" />
        <path d="M6.6 11 V18.4 H17.4 V11" />
        <circle cx="12" cy="14.7" r="1.6" fill="var(--gold-dot)" stroke="none" />
      </svg>
      {withWord && (
        <span className="font-display text-[15px] font-bold tracking-tight text-text">GroupPad</span>
      )}
    </span>
  );
}
