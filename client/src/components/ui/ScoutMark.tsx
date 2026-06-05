/** GroupPad's AI assistant brand. */
export const AI_NAME = 'Scout';

/** Unique "Scout" mark — a compass star (it finds the pick) with the brand
 *  gold dot at its heart. Replaces the generic sparkle in AI contexts.
 *  Sized via the `.ico` class (width/height from CSS) like the lucide icons. */
export function ScoutMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M12 1.5 L13.9 9.4 C14.1 10.2 14.8 10.9 15.6 11.1 L22.5 12 L15.6 12.9 C14.8 13.1 14.1 13.8 13.9 14.6 L12 22.5 L10.1 14.6 C9.9 13.8 9.2 13.1 8.4 12.9 L1.5 12 L8.4 11.1 C9.2 10.9 9.9 10.2 10.1 9.4 Z"
        fill="currentColor"
      />
      <circle cx="12" cy="12" r="2.1" fill="var(--gold-dot)" />
    </svg>
  );
}
