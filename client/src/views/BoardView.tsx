import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useCompare } from '@/hooks/useCompare';
import { Card } from '@/components/Card';
import { BoardHeader } from '@/components/chrome/BoardHeader';
import { FilterBar, type Filters } from '@/components/board/FilterBar';
import { SubmitBar } from '@/components/board/SubmitBar';
import { SearchPanel } from '@/components/board/SearchPanel';
import { ItinerarySection } from '@/components/board/ItinerarySection';
import { DecisionSection } from '@/components/board/DecisionSection';
import { ShortlistSection } from '@/components/board/ShortlistSection';
import { SubmittedSection } from '@/components/board/SubmittedSection';
import { CaveatsSection } from '@/components/board/CaveatsSection';
import { PipelineSection } from '@/components/board/PipelineSection';
import { CompareDock } from '@/components/board/CompareDock';
import { ComparisonModal } from '@/components/modals/ComparisonModal';
import { Button } from '@/components/ui/Button';

export function BoardView() {
  const { listings, shortlistIds, split, trip, user, requireSignIn, joinTrip, detailId, openDetail, closeDetail, findListing } = useApp();
  const compare = useCompare();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link the listing detail: ?listing=<id> ⇄ the DetailModal. Opening a card
  // pushes the param (so Back closes the modal); closing removes it. Works for
  // read-only visitors and direct-pasted links. The board stays mounted under the
  // overlay, so scroll position is preserved across open/close.
  const linkParam = searchParams.get('listing');
  const prevDetail = useRef<string | null>(null);
  // URL → modal. Re-runs when the trip data loads (findListing identity changes),
  // so a directly-pasted ?listing= link opens once its listing is available.
  // When the param disappears (Back button) while the modal is open, close it.
  useEffect(() => {
    if (linkParam && linkParam !== detailId && findListing(linkParam)) openDetail(linkParam);
    else if (!linkParam && detailId) closeDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkParam, findListing]);
  // modal → URL. Push the param when opening (so Back closes the modal); remove it
  // only when the user actually closes (detailId went set→null), never on mount.
  useEffect(() => {
    const cur = searchParams.get('listing');
    if (detailId) {
      if (detailId !== cur) {
        const next = new URLSearchParams(searchParams);
        next.set('listing', detailId);
        setSearchParams(next);
      }
    } else if (prevDetail.current && cur) {
      const next = new URLSearchParams(searchParams);
      next.delete('listing');
      setSearchParams(next, { replace: true });
    }
    prevDetail.current = detailId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);
  const [filters, setFilters] = useState<Filters>({
    under: false,
    pool: false,
    parking: false,
    manual: true,
  });

  const mainGrid = useMemo(
    () =>
      listings.filter((l) => {
        if (shortlistIds.has(l.id)) return false;
        if (filters.under && !(l.budget === 'under' || l.budget === 'marginal')) return false;
        if (filters.pool && l.pool !== 'yes') return false;
        if (filters.parking && l.parking !== 'yes') return false;
        if (!filters.manual && l.check_manual) return false;
        return true;
      }),
    [listings, shortlistIds, filters],
  );

  const perPersonAvg = useMemo(() => {
    const first = listings.find((l) => (l.budget === 'under' || l.budget === 'marginal') && l.est_5n);
    return first?.est_5n ? Math.ceil(first.est_5n / split) : null;
  }, [listings, split]);

  const showJoin = trip && !trip.isMember && !trip.isOwner;

  return (
    <div className="pb-20">
      <BoardHeader />

      {showJoin && (
        <div className="border-b border-border bg-accent/5 px-4 py-2.5 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 text-sm">
            <UserPlus className="h-4 w-4 text-accent" />
            <span className="text-muted">You're viewing as a guest. Join to vote, add homes, and comment.</span>
            <Button
              variant="primary"
              size="sm"
              className="ml-auto"
              onClick={() => {
                if (requireSignIn('join this trip') && trip) void joinTrip(trip.id);
              }}
            >
              {user ? 'Join this trip' : 'Sign in to join'}
            </Button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          shown={mainGrid.length}
          total={listings.length}
          perPersonAvg={perPersonAvg}
        />
        <SubmitBar />
        <SearchPanel />
        <ItinerarySection />
        <DecisionSection />
        <ShortlistSection compare={compare} />
        <SubmittedSection />
        <CaveatsSection />

        <section className="px-4 py-3 sm:px-8">
          {mainGrid.length === 0 ? (
            <p className="py-8 text-center text-muted">
              {listings.length === 0
                ? 'No homes yet — add the rentals your group is considering with “Add a listing.”'
                : 'No listings match these filters.'}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mainGrid.map((l) => (
                <Card key={l.id} listing={l} />
              ))}
            </div>
          )}
        </section>

        <PipelineSection filters={filters} />
      </div>

      <CompareDock compare={compare} />
      <ComparisonModal compare={compare} />
    </div>
  );
}
