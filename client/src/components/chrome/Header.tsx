import { useState } from 'react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

export function Header() {
  const { user, trip, listings, signOut, rename, openAuth } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');

  const underCount = listings.filter((l) => l.budget === 'under' || l.budget === 'marginal').length;

  const tripLine = trip
    ? `${trip.checkin} → ${trip.checkout_5n} (5 nights) · ${trip.adults} guests · budget $${trip.budget.toLocaleString()} all-in`
    : 'loading…';

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    try {
      await rename(name);
      setRenaming(false);
    } catch {
      /* toast handled in store */
    }
  }

  return (
    <header className="border-b border-border bg-gradient-to-b from-[#161922] to-bg px-4 py-5 sm:px-8">
      <h1 className="text-xl font-bold tracking-tight sm:text-[22px]">
        GroupPad — LA Group Trip Rentals
      </h1>
      <p className="mt-1 text-sm text-muted">{tripLine}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
        <span>
          Sites: <strong className="font-semibold text-text">VRBO · Airbnb · Booking.com</strong>
        </span>
        <span>
          Listings: <strong className="font-semibold text-text">{listings.length}</strong>
        </span>
        <span>
          Under budget: <strong className="font-semibold text-text">{underCount}</strong>
        </span>
        {trip?.refreshed_at && (
          <span>
            Refreshed: <strong className="font-semibold text-text">{trip.refreshed_at}</strong>
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {user ? (
            renaming ? (
              <form onSubmit={submitRename} className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={40}
                  className="h-7 w-32 rounded-md border border-border bg-panel-2 px-2 text-[13px] text-text outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Your name"
                />
                <Button type="submit" size="sm" variant="primary">
                  Save
                </Button>
                <button type="button" className="text-muted hover:text-text" onClick={() => setRenaming(false)}>
                  cancel
                </button>
              </form>
            ) : (
              <>
                <span>
                  Signed in: <strong className="font-semibold text-text">{user.name}</strong>
                </span>
                <button
                  className="text-link hover:underline"
                  onClick={() => {
                    setDraft(user.name);
                    setRenaming(true);
                  }}
                >
                  rename
                </button>
                <span className="text-border">·</span>
                <button className="text-link hover:underline" onClick={() => void signOut()}>
                  sign out
                </button>
              </>
            )
          ) : (
            <>
              <button
                className="text-link hover:underline"
                onClick={() => {
                  window.location.href = api.googleSignInUrl;
                }}
              >
                Sign in with Google →
              </button>
              <span className="text-border">·</span>
              <button className="text-link hover:underline" onClick={() => openAuth()}>
                or use email
              </button>
            </>
          )}
        </span>
      </div>
    </header>
  );
}
