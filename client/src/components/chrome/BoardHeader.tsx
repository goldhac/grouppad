import { Link } from 'react-router-dom';
import { Users, Calendar, Wallet, Settings } from 'lucide-react';
import { useApp } from '@/store/AppContext';

/** Per-trip header shown atop the board — the active trip's identity + key facts. */
export function BoardHeader() {
  const { trip, listings, isOwner } = useApp();
  if (!trip) return null;

  const underCount = listings.filter((l) => l.budget === 'under' || l.budget === 'marginal').length;

  return (
    <div className="border-b border-border bg-gradient-to-b from-[#161922] to-bg px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{trip.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {trip.checkin && trip.checkout_5n && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> {trip.checkin} → {trip.checkout_5n}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {trip.adults} guests
            </span>
            {trip.budget > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> ${trip.budget.toLocaleString()} all-in
              </span>
            )}
            <span>· {listings.length} homes ({underCount} under budget)</span>
          </div>
        </div>
        {isOwner && (
          <Link
            to={`/t/${trip.id}/manage`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-sm text-text hover:bg-[#262b36] hover:no-underline"
          >
            <Settings className="h-4 w-4" /> Manage trip
          </Link>
        )}
      </div>
    </div>
  );
}
