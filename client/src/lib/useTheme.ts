import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/** Reads/writes the warm theme on <html data-theme>, persisted to localStorage.
 *  The initial attribute is set by the no-FOUC bootstrap in index.html. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(
    () => (document.documentElement.getAttribute('data-theme') as Theme) || 'dark',
  );

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('gp_theme', t); } catch { /* ignore */ }
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  // Keep state in sync if the attribute is changed elsewhere.
  useEffect(() => {
    const cur = document.documentElement.getAttribute('data-theme') as Theme;
    if (cur && cur !== theme) setThemeState(cur);
  }, [theme]);

  return { theme, setTheme, toggle };
}
