import { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Plus, Users, Calendar, Crown } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

export function TripsView() {
  const { user, myTrips, accountLoading, refreshMyTrips, openAuth } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) void refreshMyTrips();
  }, [user, refreshMyTrips]);

  if (accountLoading) return <div className="py-24 text-center text-muted">Loading…</div>;
  if (!user) {
    // Not signed in — bounce to landing with the auth modal open.
    openAuth('see your trips');
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Your trips</h1>
        <Button variant="primary" onClick={() => navigate('/trips/new')}>
          <Plus className="h-4 w-4" /> New trip
        </Button>
      </div>

      {myTrips.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-panel/50 py-16 text-center">
          <p className="text-lg font-semibold">No trips yet</p>
          <p className="max-w-sm text-sm text-muted">
            Create a board for your group, share the link, and start collecting homes everyone can
            vote on.
          </p>
          <Button variant="primary" onClick={() => navigate('/trips/new')}>
            <Plus className="h-4 w-4" /> Create your first trip
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myTrips.map((t) => (
            <Link
              key={t.id}
              to={`/t/${t.id}/board`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-panel p-5 transition-colors hover:border-[#384152] hover:no-underline"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-text">{t.name}</h2>
                {t.isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">
                    <Crown className="h-3 w-3" /> organizer
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">{t.destination}</p>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted">
                {t.checkin && t.checkout_5n && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {t.checkin} → {t.checkout_5n}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {t.memberCount} member{t.memberCount === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
