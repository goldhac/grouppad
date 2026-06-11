import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { Navbar } from '@/components/chrome/Navbar';
import { Footer } from '@/components/chrome/Footer';
import { ToastStack } from '@/components/ui/ToastStack';
import { AuthModal } from '@/components/modals/AuthModal';
import { OnboardingModal } from '@/components/modals/OnboardingModal';
import { DetailModal } from '@/components/modals/DetailModal';
import { TripGate } from '@/routing/TripGate';
import { LandingView } from '@/views/LandingView';
import { TripsView } from '@/views/TripsView';
import { CreateTripView } from '@/views/CreateTripView';
import { BoardView } from '@/views/BoardView';
import { HelpView } from '@/views/HelpView';
import { ManageView } from '@/views/ManageView';
import { AdminView } from '@/views/AdminView';
import { TermsView, PrivacyView } from '@/views/LegalView';
import { PressView } from '@/views/PressView';

/** "/" → trips dashboard when signed in, else the product landing page. */
function RootIndex() {
  const { user, accountLoading } = useApp();
  if (accountLoading) return null;
  return user ? <Navigate to="/trips" replace /> : <LandingView />;
}

/** Close the detail modal + scroll to top on every navigation. */
function RouteEffects() {
  const location = useLocation();
  const navigate = useNavigate();
  const { closeDetail, user, joinTrip } = useApp();
  useEffect(() => {
    closeDetail();
    window.scrollTo(0, 0);
  }, [location.pathname, closeDetail]);

  // Capture an invite's ?join=<code> from the URL and remember it — this survives
  // the magic-link sign-in round-trip (which lands back on "/"), so an invited
  // guest who signs in is actually joined instead of dumped on an empty dashboard.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('join');
    const m = location.pathname.match(/^\/t\/([^/]+)\/board/);
    if (code && m) {
      try { localStorage.setItem('gp_pending_join', JSON.stringify({ tripId: m[1], code })); } catch { /* ignore */ }
    }
  }, [location.search, location.pathname]);

  // Once signed in, consume any pending invite: join the trip + land on its board.
  useEffect(() => {
    if (!user) return;
    let pending: { tripId?: string; code?: string } | null = null;
    try { pending = JSON.parse(localStorage.getItem('gp_pending_join') || 'null'); } catch { /* ignore */ }
    if (!pending?.tripId) return;
    localStorage.removeItem('gp_pending_join');
    void joinTrip(pending.tripId, pending.code).finally(() => navigate(`/t/${pending!.tripId}/board`));
  }, [user, joinTrip, navigate]);

  return null;
}

export function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <RouteEffects />

      <div className="flex-1">
        <Routes>
          <Route path="/" element={<RootIndex />} />
          <Route path="/trips" element={<TripsView />} />
          <Route path="/trips/new" element={<CreateTripView />} />
          <Route path="/t/:tripId/board" element={<TripGate><BoardView /></TripGate>} />
          <Route path="/t/:tripId/help" element={<TripGate><HelpView /></TripGate>} />
          <Route path="/t/:tripId/manage" element={<TripGate><ManageView /></TripGate>} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="/terms" element={<TermsView />} />
          <Route path="/privacy" element={<PrivacyView />} />
          <Route path="/press" element={<PressView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <Footer />

      <AuthModal />
      <OnboardingModal />
      <DetailModal />
      <ToastStack />
    </div>
  );
}
