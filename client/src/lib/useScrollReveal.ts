import { useEffect } from 'react';

/**
 * Reveals `.rv` elements by adding `.in` once they scroll into view.
 * Transform-only (CSS) and content is always painted, so a stalled clock can
 * never leave anything invisible. Re-checks on scroll/resize + after layout.
 */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    const check = () => {
      const vh = window.innerHeight || 800;
      document.querySelectorAll('.rv:not(.in)').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.9 && r.bottom > 0) el.classList.add('in');
      });
    };
    check();
    const t = window.setTimeout(check, 250);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
