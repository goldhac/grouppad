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

/** Lock the underlying document while a full-screen mobile shell (`.gp-mobile`)
 *  is mounted, so iOS Safari doesn't hand the first touch to the page body
 *  instead of the inner scroller. Refcounted so nested shells are safe. */
let _shellLocks = 0;
export function useMobileShellLock(active = true) {
  useEffect(() => {
    if (!active) return;
    _shellLocks += 1;
    document.documentElement.classList.add('gp-mobile-active');
    return () => {
      _shellLocks = Math.max(0, _shellLocks - 1);
      if (_shellLocks === 0) document.documentElement.classList.remove('gp-mobile-active');
    };
  }, [active]);
}
