import { useEffect, type ReactNode } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

/** Loads the trip named in the URL into the store, then renders the trip UI.
 *  Handles view-by-link (open to anyone) + auto-join when a ?join code is present. */
export function TripGate({ children }: { children: ReactNode }) {
  const { tripId: param } = useParams();
  const [search] = useSearchParams();
  const { enterTrip, joinTrip, trip, tripId, tripLoading, tripError, user } = useApp();

  useEffect(() => {
    if (param) void enterTrip(param);
  }, [param, enterTrip]);

  // Auto-join when arriving via an invite link (?join=code) while signed in.
  useEffect(() => {
    const code = search.get('join');
    if (code && param && user && trip && trip.id === param && !trip.isMember) {
      void joinTrip(param, code);
    }
  }, [search, param, user, trip, joinTrip]);

  if (tripError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-lg font-semibold">{tripError}</p>
        <p className="max-w-sm text-sm text-muted">
          This trip may have been removed, or the link is incomplete.
        </p>
        <Button asChild variant="primary">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    );
  }

  if (!trip || tripId !== param || tripLoading) {
    return <div className="flex items-center justify-center py-24 text-muted">Loading trip…</div>;
  }

  return <>{children}</>;
}
