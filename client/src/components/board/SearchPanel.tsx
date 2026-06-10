import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

/** Polls the trip's rental-search status; refreshes listings when a run finishes. */
function useTripSearch() {
  const { tripId, refreshListings, toast } = useApp();
  const [searching, setSearching] = useState(false);
  const [configured, setConfigured] = useState(true);
  const wasSearching = useRef(false);

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    const tick = async () => {
      try {
        const s = await api.searchStatus(tripId);
        if (!active) return;
        setConfigured(s.configured);
        setSearching(s.searching);
        if (wasSearching.current && !s.searching) {
          // A run just finished — pull in the new homes.
          await refreshListings();
          toast('Rental search finished.', 'success');
        }
        wasSearching.current = s.searching;
      } catch {
        /* ignore */
      }
    };
    void tick();
    const h = window.setInterval(tick, 5000);
    return () => {
      active = false;
      window.clearInterval(h);
    };
  }, [tripId, refreshListings, toast]);

  const trigger = useCallback(async () => {
    if (!tripId) return;
    try {
      await api.runSearch(tripId);
      setSearching(true);
      wasSearching.current = true;
      toast('Searching for rentals…', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the search.', 'error');
    }
  }, [tripId, toast]);

  return { searching, configured, trigger };
}

export function SearchPanel() {
  const { trip, isOwner, listings } = useApp();
  const { searching, configured, trigger } = useTripSearch();
  if (!trip) return null;

  if (searching) {
    return (
      <div className="px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <div>
            <p className="text-sm font-semibold">Finding rentals in {trip.destination}…</p>
            <p className="text-xs text-muted">This takes a minute. Homes will appear here automatically.</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty board: prompt the organizer to search (or anyone to add manually).
  if (listings.length === 0 && isOwner) {
    return (
      <div className="px-4 py-3 sm:px-8">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-panel/50 p-8 text-center">
          <Search className="h-6 w-6 text-muted" />
          <p className="font-semibold">No homes on the board yet</p>
          {configured ? (
            <>
              <p className="max-w-sm text-sm text-muted">
                Search {trip.destination} for rentals that fit your group, or add specific ones with
                “Add a listing.”
              </p>
              <Button variant="primary" onClick={() => void trigger()}>
                <Search className="h-4 w-4" /> Search {trip.destination} rentals
              </Button>
            </>
          ) : (
            <p className="max-w-sm text-sm text-muted">
              Auto-search isn’t configured on this server. Add the homes you’re considering with
              <span className="text-text"> “Add a listing.”</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
