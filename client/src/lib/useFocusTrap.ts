import { useEffect } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Trap Tab focus within `ref` while `active`, and restore focus to the launcher
 * when it deactivates/unmounts. For custom (non-Radix) modal overlays.
 *
 * `onEscape` is optional and additive — existing two-argument callers are
 * unaffected. It exists because a dialog that declares `aria-modal` is making
 * three promises, not one: focus stays inside, Escape gets you out, and focus
 * comes back where it started. Declaring the attribute and keeping only the
 * first promise is worse than not declaring it, because assistive technology
 * believes the claim.
 *
 * Focus is moved TO THE CONTAINER rather than to its first control. Focusing
 * the first button would fire its VoiceOver announcement instead of the
 * dialog's own label, and on a phone, focusing a first field would throw up the
 * keyboard over a sheet nobody asked to type into. The container needs
 * `tabIndex={-1}` for this to land.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const launcher = document.activeElement as HTMLElement | null;
    // Move focus in, so the first Tab starts inside the dialog rather than
    // continuing through the page behind it.
    // Only when the caller opted in with an explicit tabIndex. `root.tabIndex`
    // reads -1 for any plain div, so testing it tells you nothing — the four
    // desktop modals pass an un-focusable scrim and must keep their existing
    // behaviour, which is to leave focus where it was.
    if (root.hasAttribute('tabindex')) root.focus({ preventScroll: true });
    const list = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) { e.stopPropagation(); onEscape(); return; }
      if (e.key !== 'Tab') return;
      const f = list();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || !root.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !root.contains(a))) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', onKey);
    // Escape is also bound at the document, because a stray click on the scrim
    // can leave focus outside the root while the dialog is still open.
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape && !root.contains(document.activeElement)) onEscape();
    };
    if (onEscape) document.addEventListener('keydown', onDocKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (onEscape) document.removeEventListener('keydown', onDocKey);
      if (launcher && typeof launcher.focus === 'function') launcher.focus();
    };
  }, [active, ref, onEscape]);
}
