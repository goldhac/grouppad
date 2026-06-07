import { useEffect, useState } from 'react';

/** True when the viewport is at/below the handoff's mobile breakpoint (520px).
 *  Drives whether the dedicated mobile app-shell renders instead of desktop. */
export function useIsMobile(breakpoint = 520): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
