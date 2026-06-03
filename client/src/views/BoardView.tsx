import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/store/AppContext';
import { useCompare } from '@/hooks/useCompare';
import { Card } from '@/components/Card';
import { FilterBar, type Filters } from '@/components/board/FilterBar';
import { SubmitBar } from '@/components/board/SubmitBar';
import { ItinerarySection } from '@/components/board/ItinerarySection';
import { DecisionSection } from '@/components/board/DecisionSection';
import { ShortlistSection } from '@/components/board/ShortlistSection';
import { SubmittedSection } from '@/components/board/SubmittedSection';
import { CaveatsSection } from '@/components/board/CaveatsSection';
import { PipelineSection } from '@/components/board/PipelineSection';
import { CompareDock } from '@/components/board/CompareDock';

export function BoardView() {
  const { listings, shortlistIds, split, adminKey } = useApp();
  const compare = useCompare();
  const [filters, setFilters] = useState<Filters>({
    under: true,
    pool: false,
    parking: false,
    manual: false,
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

  return (
    <div className="pb-20">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        shown={mainGrid.length}
        total={listings.length}
        perPersonAvg={perPersonAvg}
      />
      <SubmitBar />
      <ItinerarySection />
      <DecisionSection />
      <ShortlistSection compare={compare} />
      <SubmittedSection />
      <CaveatsSection />

      <section className="px-4 py-3 sm:px-8">
        {mainGrid.length === 0 ? (
          <p className="py-8 text-center text-muted">No listings match these filters.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mainGrid.map((l) => (
              <Card key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      <PipelineSection filters={filters} />

      {!adminKey && (
        <div className="px-4 py-6 text-center sm:px-8">
          <Link to="/admin" className="text-xs text-muted hover:text-text">
            🔑 Organizer? Enter admin
          </Link>
        </div>
      )}

      <CompareDock compare={compare} />
    </div>
  );
}
