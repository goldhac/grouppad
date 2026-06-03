import { useEffect, useState } from 'react';

/** Per-trip persisted open/closed state for a collapsible board section. */
export function useCollapsed(scope: string | undefined, key: string, defaultOpen: boolean) {
  const storageKey = `gp_sec:${scope || 'x'}:${key}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v == null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [storageKey, open]);
  return [open, () => setOpen((o) => !o)] as const;
}
