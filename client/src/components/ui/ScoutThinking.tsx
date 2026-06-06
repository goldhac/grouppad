/** Scout's "working" loop — a breathing compass star with a gold dot orbiting
 *  it. Used wherever the AI is running (verdict, insights, compare). Seamless
 *  ~1.6s loop, calm sine. Theme-aware (star = accent, dot = gold). Reduced
 *  motion holds it still (CSS-gated). */
export function ScoutThinking({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={`scout-think sz-${size} ${className}`} role="status" aria-label="Scout is thinking">
      <svg viewBox="0 0 48 48" fill="none">
        {/* breathing compass star (the Scout mark) */}
        <path
          className="st-star"
          d="M24 6 L27.8 21.6 C28.2 23.2 29.4 24.4 31 24.8 L46 24 L31 24.8 C29.4 25.2 28.2 26.4 27.8 28 L24 42 L20.2 28 C19.8 26.4 18.6 25.2 17 24.8 L2 24 L17 24.8 C18.6 24.4 19.8 23.2 20.2 21.6 Z"
          fill="currentColor"
          opacity="0.92"
        />
        {/* orbiting gold dot */}
        <g className="st-orbit">
          <circle className="st-trail" cx="24" cy="6" r="2.2" fill="var(--gold-dot)" opacity="0.3" />
          <circle cx="24" cy="5" r="3" fill="var(--gold-dot)" />
        </g>
      </svg>
    </span>
  );
}
