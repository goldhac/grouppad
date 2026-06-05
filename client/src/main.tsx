import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import './ds2/tokens.css';
import './ds2/components.css';
import './ds2/patterns.css';
import './ds2/landing.css';
import './ds2/demo-panel.css';
import './ds2/trips.css';
import './ds2/board.css';
import './ds2/detail.css';
import './ds2/manage.css';
import './ds2/auth.css';
import './ds2/util.css';
import { App } from './App';
import { AppProvider } from './store/AppContext';

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
