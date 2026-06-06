/** Empty All-homes illustration — a soft board with two cards gently floating
 *  (staggered) and a dashed "+" slot beckoning the first add. Ambient loop,
 *  theme-aware. Reduced motion holds it still (CSS-gated). */
export function EmptyBoardArt({ className = '' }: { className?: string }) {
  return (
    <svg className={`empty-art ${className}`} viewBox="0 0 168 120" fill="none" aria-hidden>
      {/* board base */}
      <rect x="6" y="14" width="156" height="92" rx="12" fill="var(--surface-sunken)" stroke="var(--border)" strokeWidth="1.5" />
      {/* floating card 1 */}
      <g className="ea-card ea-card-1">
        <rect x="22" y="34" width="46" height="52" rx="8" fill="var(--surface-raised)" stroke="var(--border)" strokeWidth="1.5" />
        <rect x="29" y="41" width="32" height="20" rx="4" fill="var(--accent)" opacity="0.18" />
        <rect x="29" y="66" width="26" height="4" rx="2" fill="var(--border-strong, var(--border))" />
        <rect x="29" y="74" width="18" height="4" rx="2" fill="var(--border)" />
      </g>
      {/* floating card 2 */}
      <g className="ea-card ea-card-2">
        <rect x="100" y="34" width="46" height="52" rx="8" fill="var(--surface-raised)" stroke="var(--border)" strokeWidth="1.5" />
        <rect x="107" y="41" width="32" height="20" rx="4" fill="var(--accent)" opacity="0.18" />
        <rect x="107" y="66" width="26" height="4" rx="2" fill="var(--border-strong, var(--border))" />
        <rect x="107" y="74" width="18" height="4" rx="2" fill="var(--border)" />
      </g>
      {/* center dashed "+" slot */}
      <g className="ea-plus">
        <circle cx="84" cy="60" r="15" fill="var(--accent)" opacity="0.12" />
        <path d="M84 53 V67 M77 60 H91" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
