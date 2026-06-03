import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { Header } from '@/components/chrome/Header';
import { Nav } from '@/components/chrome/Nav';
import { Footer } from '@/components/chrome/Footer';
import { ToastStack } from '@/components/ui/ToastStack';
import { AuthModal } from '@/components/modals/AuthModal';
import { OnboardingModal } from '@/components/modals/OnboardingModal';
import { DetailModal } from '@/components/modals/DetailModal';
import { WelcomeView } from '@/views/WelcomeView';
import { BoardView } from '@/views/BoardView';
import { HelpView } from '@/views/HelpView';
import { AdminView } from '@/views/AdminView';
import { Button } from '@/components/ui/Button';

/** "/" resolves to the board when signed in, else the welcome page. */
function RouteIndex() {
  const { user } = useApp();
  return <Navigate to={user ? '/board' : '/welcome'} replace />;
}

/** Close the detail modal and scroll to top whenever the route changes. */
function RouteEffects() {
  const location = useLocation();
  const { closeDetail } = useApp();
  useEffect(() => {
    closeDetail();
    window.scrollTo(0, 0);
  }, [location.pathname, closeDetail]);
  return null;
}

export function App() {
  const { loading, loadError, reload } = useApp();

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">Couldn't load GroupPad</p>
        <p className="max-w-sm text-sm text-muted">{loadError}</p>
        <Button variant="primary" onClick={() => void reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <Nav />
      <RouteEffects />

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted">Loading…</div>
        ) : (
          <Routes>
            <Route path="/" element={<RouteIndex />} />
            <Route path="/welcome" element={<WelcomeView />} />
            <Route path="/board" element={<BoardView />} />
            <Route path="/help" element={<HelpView />} />
            <Route path="/admin" element={<AdminView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </div>

      <Footer />

      {/* Global overlays */}
      <AuthModal />
      <OnboardingModal />
      <DetailModal />
      <ToastStack />
    </div>
  );
}
