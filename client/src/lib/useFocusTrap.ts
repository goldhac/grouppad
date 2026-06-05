import { useEffect } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Trap Tab focus within `ref` while `active`, and restore focus to the launcher
 *  when it deactivates/unmounts. For custom (non-Radix) modal overlays. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const launcher = document.activeElement as HTMLElement | null;
    const list = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = list();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || !root.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !root.contains(a))) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (launcher && typeof launcher.focus === 'function') launcher.focus();
    };
  }, [active, ref]);
}
