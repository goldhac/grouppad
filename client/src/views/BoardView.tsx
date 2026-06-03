import { useMemo, useState } from 'react';
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
  const { listings, shortlistIds, split, trip, user, requireSignIn, joinTrip } = useApp();
  const compare = useCompare();
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
