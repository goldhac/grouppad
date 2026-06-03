import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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

/** "/" → trips dashboard when signed in, else the product landing page. */
function RootIndex() {
  const { user, accountLoading } = useApp();
  if (accountLoading) return null;
  return user ? <Navigate to="/trips" replace /> : <LandingView />;
}

/** Close the detail modal + scroll to top on every navigation. */
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
