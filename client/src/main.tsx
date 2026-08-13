import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import './ds2/tokens.css';
import './ds2/themes.css';
import './ds2/components.css';
import './ds2/patterns.css';
import './ds2/landing.css';
import './ds2/demo-panel.css';
import './ds2/trips.css';
import './ds2/board.css';
import './ds2/boardx.css';
import './ds2/detail.css';
import './ds2/manage.css';
import './ds2/auth.css';
import './ds2/celebrate.css';
import './ds2/util.css';
import './ds2/signature.css';
import './ds2/motion.css';
import './ds2/mobile.css';
import './ds2/mobile-app.css';
import { App } from './App';
import { AppProvider } from './store/AppContext';
import { initAnalytics } from './lib/analytics';

// Product analytics + client error monitoring (PostHog). No-op unless a key is
// configured (POSTHOG_KEY at runtime), and never runs on the dev server.
initAnalytics();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    {/* HashRouter is required: the Express backend serves only `/` and has no
        SPA fallback route, so deep links must live in the URL fragment. */}
    <HashRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </HashRouter>
  </StrictMode>,
);

// Register the service worker so the app is installable (Add to Home Screen)
// and has an offline shell. Production only — avoids caching the dev server.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ });
  });
}
