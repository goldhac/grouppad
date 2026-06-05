/** @type {import('tailwindcss').Config} */
export default {
  // Theme is driven by [data-theme] on <html> (set in index.html before paint).
  // Tokens resolve per theme via CSS vars; the dark: variant maps to the attribute.
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── v2 semantic tokens (resolve per theme via ds2/tokens.css) ──────────
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        'surface-sunken': 'var(--surface-sunken)',
        'surface-inset': 'var(--surface-inset)',
        'surface-overlay': 'var(--surface-overlay)',
        scrim: 'var(--scrim)',

        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-muted': 'var(--text-muted)',
        'on-photo': 'var(--text-on-photo)',

        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',

        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-active': 'var(--accent-active)',
        'accent-fg': 'var(--accent-fg)',
        'accent-text': 'var(--accent-text)',
        'accent-tint': 'var(--accent-tint)',
        'accent-tint-2': 'var(--accent-tint-2)',
        link: 'var(--link)',

        official: 'var(--official)',
        'official-fg': 'var(--official-fg)',
        star: 'var(--star)',
        'star-bg': 'var(--star-bg)',
        'star-border': 'var(--star-border)',
        'gold-dot': 'var(--gold-dot)',

        under: 'var(--under)', 'under-bg': 'var(--under-bg)', 'under-border': 'var(--under-border)',
        marginal: 'var(--marginal)', 'marginal-bg': 'var(--marginal-bg)', 'marginal-border': 'var(--marginal-border)',
        over: 'var(--over)', 'over-bg': 'var(--over-bg)', 'over-border': 'var(--over-border)',
        unknown: 'var(--unknown)', 'unknown-bg': 'var(--unknown-bg)', 'unknown-border': 'var(--unknown-border)',
        up: 'var(--up)', 'up-bg': 'var(--up-bg)',
        down: 'var(--down)', 'down-bg': 'var(--down-bg)',
        rank: 'var(--rank)', 'rank-fg': 'var(--rank-fg)',
        'rank-soft-bg': 'var(--rank-soft-bg)', 'rank-soft-fg': 'var(--rank-soft-fg)',
        community: 'var(--community)', 'community-bg': 'var(--community-bg)', 'community-border': 'var(--community-border)',
        live: 'var(--live)', 'live-bg': 'var(--live-bg)', 'live-border': 'var(--live-border)',
        danger: 'var(--danger)', 'danger-bg': 'var(--danger-bg)', 'danger-border': 'var(--danger-border)',

        // ── back-compat aliases (old class names still used by un-migrated screens) ──
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-2': 'var(--panel-2)',
        muted: 'var(--muted)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Hanken Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        brand: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xs: 'var(--r-xs)',   // 6
        sm: 'var(--r-sm)',   // 8
        md: 'var(--r-md)',   // 12
        lg: 'var(--r-lg)',   // 16
        card: 'var(--r-card)', // 18
        xl: 'var(--r-xl)',   // 22
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        pop: 'var(--shadow-pop)',
      },
      ringColor: { DEFAULT: 'var(--ring)', ring: 'var(--ring)' },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        standard: 'var(--ease-standard)',
        settle: 'var(--ease-settle)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms var(--ease-out)',
        'pop-in': 'pop-in 200ms var(--ease-out)',
        'toast-in': 'toast-in 200ms var(--ease-out)',
      },
    },
  },
  plugins: [],
};
